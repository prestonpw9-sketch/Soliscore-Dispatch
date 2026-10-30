-- NOT yet applied to the hosted project. Apply only with Preston's OK.
-- Do not run this file from CI or from the app.
--
-- Job-site coordinates for crew arrival detection. public.jobs is the job-site
-- table (address lives in location). Coordinates stay null until an address is
-- geocoded. The optional geocoder is src/lib/geocodeAddress.ts — it is not
-- called by the app and it does not write to the database.
--
-- geofence_radius_m defaults to 90 meters, about 300 feet.

alter table public.jobs
  add column if not exists latitude double precision;

alter table public.jobs
  add column if not exists longitude double precision;

alter table public.jobs
  add column if not exists geofence_radius_m integer not null default 90;

comment on column public.jobs.latitude is
  'WGS84 latitude of the job site. Null until the address is geocoded.';

comment on column public.jobs.longitude is
  'WGS84 longitude of the job site. Null until the address is geocoded.';

comment on column public.jobs.geofence_radius_m is
  'Arrival radius in meters. Default 90 (about 300 feet).';

alter table public.jobs drop constraint if exists jobs_latitude_range;
alter table public.jobs
  add constraint jobs_latitude_range
  check (latitude is null or latitude between -90 and 90);

alter table public.jobs drop constraint if exists jobs_longitude_range;
alter table public.jobs
  add constraint jobs_longitude_range
  check (longitude is null or longitude between -180 and 180);

alter table public.jobs drop constraint if exists jobs_geofence_pair;
alter table public.jobs
  add constraint jobs_geofence_pair
  check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  );

alter table public.jobs drop constraint if exists jobs_geofence_radius_m_range;
alter table public.jobs
  add constraint jobs_geofence_radius_m_range
  check (geofence_radius_m between 30 and 1000);

create index if not exists jobs_site_geofence_idx
  on public.jobs (latitude, longitude)
  where latitude is not null and longitude is not null;
