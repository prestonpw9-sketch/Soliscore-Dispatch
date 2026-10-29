-- NOT yet applied to the hosted project. Apply only with Preston's OK.
-- Do not run this file from CI or from the app.
--
-- Automatic shift tracking. The phone generates the ids and upserts them, so a
-- replay after a dead zone cannot insert a second copy of the same segment.
-- Location is recorded only while a shift is clocked in.
--
-- Job geofences stay a few hundred feet. 200 m is about 650 ft. Miles-wide
-- fences would overlap neighboring jobs, so dwell time is what confirms a stop.

alter table public.jobs drop constraint if exists jobs_geofence_radius_m_range;
alter table public.jobs
  add constraint jobs_geofence_radius_m_range
  check (geofence_radius_m between 30 and 200);

comment on column public.jobs.geofence_radius_m is
  'Arrival radius in meters. Default 90 (about 300 feet). Maximum 200 (about 650 feet).';

create table if not exists public.shop_locations (
  id uuid primary key,
  name text not null default 'Shop',
  latitude double precision not null,
  longitude double precision not null,
  radius_m integer not null default 90,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint shop_locations_latitude_range check (latitude between -90 and 90),
  constraint shop_locations_longitude_range check (longitude between -180 and 180),
  constraint shop_locations_radius_m_range check (radius_m between 30 and 200)
);

create unique index if not exists shop_locations_one_active_idx
  on public.shop_locations (active)
  where active;

comment on table public.shop_locations is
  'Shop geofence used to start a shift and to record the return to the shop. One active row.';

create table if not exists public.shifts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  end_reason text,
  battery_start smallint,
  battery_end smallint,
  start_latitude double precision,
  start_longitude double precision,
  updated_at timestamptz not null default now(),
  constraint shifts_end_reason_check check (end_reason is null or end_reason in ('clock_out', 'auto_stop')),
  constraint shifts_battery_start_range check (battery_start is null or battery_start between 0 and 100),
  constraint shifts_battery_end_range check (battery_end is null or battery_end between 0 and 100)
);

create index if not exists shifts_user_started_idx
  on public.shifts (user_id, started_at desc);

comment on table public.shifts is
  'One clock-in to clock-out. id is generated on the phone and upserted.';

create table if not exists public.time_segments (
  id uuid primary key,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  job_id bigint references public.jobs (id) on delete set null,
  job_name text,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_latitude double precision,
  start_longitude double precision,
  end_latitude double precision,
  end_longitude double precision,
  battery_start smallint,
  battery_end smallint,
  updated_at timestamptz not null default now(),
  constraint time_segments_kind_check check (kind in ('shop', 'driving', 'job')),
  constraint time_segments_battery_start_range check (battery_start is null or battery_start between 0 and 100),
  constraint time_segments_battery_end_range check (battery_end is null or battery_end between 0 and 100)
);

create index if not exists time_segments_shift_started_idx
  on public.time_segments (shift_id, started_at);

create index if not exists time_segments_user_started_idx
  on public.time_segments (user_id, started_at desc);

comment on table public.time_segments is
  'Shop, driving, and on-site stretches inside a shift. Travel (driving) is separate from job time.';

create table if not exists public.shift_battery_samples (
  id uuid primary key,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  sampled_at timestamptz not null,
  battery_percent smallint not null,
  constraint shift_battery_samples_percent_range check (battery_percent between 0 and 100)
);

create index if not exists shift_battery_samples_shift_idx
  on public.shift_battery_samples (shift_id, sampled_at);

comment on table public.shift_battery_samples is
  'Battery percent at clock-in, on a timer during the shift, and at clock-out.';

alter table public.shop_locations enable row level security;
alter table public.shifts enable row level security;
alter table public.time_segments enable row level security;
alter table public.shift_battery_samples enable row level security;

revoke all on public.shop_locations from anon;
revoke all on public.shifts from anon;
revoke all on public.time_segments from anon;
revoke all on public.shift_battery_samples from anon;

grant select, insert, update, delete on public.shop_locations to authenticated;
grant select, insert, update, delete on public.shifts to authenticated;
grant select, insert, update, delete on public.time_segments to authenticated;
grant select, insert, update, delete on public.shift_battery_samples to authenticated;

drop policy if exists shop_locations_select on public.shop_locations;
drop policy if exists shop_locations_write on public.shop_locations;
drop policy if exists shop_locations_update on public.shop_locations;
drop policy if exists shop_locations_delete on public.shop_locations;

create policy shop_locations_select
  on public.shop_locations for select
  to authenticated
  using (true);

create policy shop_locations_insert
  on public.shop_locations for insert
  to authenticated
  with check (is_owner());

create policy shop_locations_update
  on public.shop_locations for update
  to authenticated
  using (is_owner())
  with check (is_owner());

create policy shop_locations_delete
  on public.shop_locations for delete
  to authenticated
  using (is_owner());

-- Crew read and upsert their own rows. Owners and office can read every row.
-- Office stays view-only, matching the rest of dispatch.

drop policy if exists shifts_select on public.shifts;
drop policy if exists shifts_insert on public.shifts;
drop policy if exists shifts_update on public.shifts;
drop policy if exists shifts_delete on public.shifts;

create policy shifts_select
  on public.shifts for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or is_owner()
    or "current_role"() = 'office'
  );

create policy shifts_insert
  on public.shifts for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy shifts_update
  on public.shifts for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and "current_role"() = any (array['owner', 'crew'])
  )
  with check (
    user_id = (select auth.uid())
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy shifts_delete
  on public.shifts for delete
  to authenticated
  using (is_owner());

drop policy if exists time_segments_select on public.time_segments;
drop policy if exists time_segments_insert on public.time_segments;
drop policy if exists time_segments_update on public.time_segments;
drop policy if exists time_segments_delete on public.time_segments;

create policy time_segments_select
  on public.time_segments for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or is_owner()
    or "current_role"() = 'office'
  );

create policy time_segments_insert
  on public.time_segments for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy time_segments_update
  on public.time_segments for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and "current_role"() = any (array['owner', 'crew'])
  )
  with check (
    user_id = (select auth.uid())
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy time_segments_delete
  on public.time_segments for delete
  to authenticated
  using (is_owner());

drop policy if exists shift_battery_samples_select on public.shift_battery_samples;
drop policy if exists shift_battery_samples_insert on public.shift_battery_samples;
drop policy if exists shift_battery_samples_delete on public.shift_battery_samples;

create policy shift_battery_samples_select
  on public.shift_battery_samples for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or is_owner()
    or "current_role"() = 'office'
  );

create policy shift_battery_samples_insert
  on public.shift_battery_samples for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy shift_battery_samples_delete
  on public.shift_battery_samples for delete
  to authenticated
  using (is_owner());
