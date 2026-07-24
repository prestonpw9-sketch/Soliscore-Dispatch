-- Crew day-off ranges + editable dispatch reminder banner.

create table if not exists public.tech_time_off (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.technicians(id) on delete cascade,
  start_date text not null,
  end_date text not null,
  note text null,
  created_at timestamptz default now(),
  constraint tech_time_off_date_order check (end_date >= start_date)
);

create index if not exists tech_time_off_tech_dates_idx
  on public.tech_time_off (technician_id, start_date, end_date);

alter table public.tech_time_off enable row level security;

create policy tech_time_off_read
  on public.tech_time_off for select
  to authenticated
  using (true);

create policy tech_time_off_insert
  on public.tech_time_off for insert
  to authenticated
  with check ("current_role"() = any (array['owner', 'crew']));

create policy tech_time_off_update
  on public.tech_time_off for update
  to authenticated
  using ("current_role"() = any (array['owner', 'crew']))
  with check ("current_role"() = any (array['owner', 'crew']));

create policy tech_time_off_delete
  on public.tech_time_off for delete
  to authenticated
  using ("current_role"() = any (array['owner', 'crew']));

-- Single editable reminder banner (id = 1).
create table if not exists public.dispatch_announcements (
  id integer primary key check (id = 1),
  message text not null,
  updated_at timestamptz default now(),
  updated_by uuid null
);

alter table public.dispatch_announcements enable row level security;

create policy dispatch_announcements_read
  on public.dispatch_announcements for select
  to authenticated
  using (true);

create policy dispatch_announcements_insert
  on public.dispatch_announcements for insert
  to authenticated
  with check ("current_role"() = 'owner');

create policy dispatch_announcements_update
  on public.dispatch_announcements for update
  to authenticated
  using ("current_role"() = 'owner')
  with check ("current_role"() = 'owner');

insert into public.dispatch_announcements (id, message)
values (
  1,
  'Starting Thu Jul 30: Four 10s — Mon–Thu 6:00am–4:30pm. Fridays off unless told otherwise.'
)
on conflict (id) do nothing;
