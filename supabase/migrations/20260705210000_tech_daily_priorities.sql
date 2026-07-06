-- One "first stop" job per technician per work day (route ordering).

create table if not exists public.tech_daily_priorities (
  technician_id uuid not null references public.technicians(id) on delete cascade,
  work_date text not null,
  job_id bigint not null references public.jobs(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (technician_id, work_date)
);

alter table public.tech_daily_priorities enable row level security;

create policy tech_daily_priorities_read
  on public.tech_daily_priorities for select
  to authenticated
  using (true);

create policy tech_daily_priorities_insert
  on public.tech_daily_priorities for insert
  to authenticated
  with check ("current_role"() = any (array['owner', 'crew']));

create policy tech_daily_priorities_update
  on public.tech_daily_priorities for update
  to authenticated
  using ("current_role"() = any (array['owner', 'crew']))
  with check ("current_role"() = any (array['owner', 'crew']));

create policy tech_daily_priorities_delete
  on public.tech_daily_priorities for delete
  to authenticated
  using ("current_role"() = any (array['owner', 'crew']));
