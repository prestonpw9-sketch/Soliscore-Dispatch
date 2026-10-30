-- NOT yet applied to the hosted project. Apply only with Preston's OK.
-- Do not run this file from CI or from the app.
-- Apply after 20261029040032_job_site_geofence.sql (it adds jobs.latitude / longitude).
--
-- Automatic job-address geocoding. The geocode-job edge function fills
-- latitude / longitude server-side (US Census first, Nominatim fallback,
-- Arizona bias). It never overwrites coordinates that are already set; its
-- update is filtered on latitude is null.
--
-- geocode_status
--   pending     address saved, lookup not finished yet
--   ok          coordinates came from the geocoder
--   manual      coordinates were pasted or set by hand
--   failed      no confident match (job card shows "Fix location")
--   no_address  location is blank or a placeholder ("Address pending")
--   stale       the address changed after the job was pinned; the old pin
--               was kept and needs a look
--
-- Null status is treated as pending by the app and the backfill script.

alter table public.jobs
  add column if not exists geocode_status text;

alter table public.jobs
  add column if not exists geocoded_address text;

alter table public.jobs
  add column if not exists geocode_source text;

alter table public.jobs
  add column if not exists geocoded_at timestamptz;

alter table public.jobs drop constraint if exists jobs_geocode_status_check;
alter table public.jobs
  add constraint jobs_geocode_status_check
  check (geocode_status is null or geocode_status in ('pending', 'ok', 'manual', 'failed', 'no_address', 'stale'));

alter table public.jobs drop constraint if exists jobs_geocode_source_check;
alter table public.jobs
  add constraint jobs_geocode_source_check
  check (geocode_source is null or geocode_source in ('census', 'nominatim', 'manual'));

comment on column public.jobs.geocode_status is
  'pending / ok / manual / failed / no_address / stale. Set by the geocode-job edge function and the Fix location dialog.';
comment on column public.jobs.geocoded_address is
  'Address the geocoder matched (for example the Census matchedAddress). Shown on the job card.';
comment on column public.jobs.geocode_source is
  'census, nominatim, or manual.';
comment on column public.jobs.geocoded_at is
  'When latitude / longitude were last filled.';

-- Coordinates pasted before this migration were set by hand.
update public.jobs
  set geocode_status = 'manual',
      geocode_source = coalesce(geocode_source, 'manual')
  where latitude is not null
    and longitude is not null
    and geocode_status is null;

-- Address edits: an unpinned job goes back to pending. A pinned job keeps its
-- coordinates and is flagged stale so the office can confirm the pin.
-- BEFORE UPDATE only, so the SMS insert path is untouched.
create or replace function public.jobs_mark_geocode_on_address_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.location is distinct from old.location then
    if new.latitude is null or new.longitude is null then
      new.geocode_status := 'pending';
    elsif new.latitude is not distinct from old.latitude
      and new.longitude is not distinct from old.longitude then
      new.geocode_status := 'stale';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_mark_geocode_on_address_change on public.jobs;
create trigger jobs_mark_geocode_on_address_change
  before update of location on public.jobs
  for each row
  execute function public.jobs_mark_geocode_on_address_change();

create index if not exists jobs_geocode_pending_idx
  on public.jobs (id)
  where latitude is null;
