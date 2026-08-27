-- Daily frozen copies of the dispatch board for the in-app AI.
-- Documentation + runnable against the hosted project.
-- One row per Arizona calendar day; today's row is upserted as the board changes.
-- Past days stay frozen even after jobs are moved or completed.

create table if not exists public.schedule_history (
  snapshot_date text primary key
    check (snapshot_date ~ '^\d{4}-\d{2}-\d{2}$'),
  captured_at timestamptz not null default now(),
  source text not null default 'system'
    check (source = any (array['system', 'ai', 'user'])),
  created_by uuid null,
  job_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb
);

comment on table public.schedule_history is
  'Daily freeze of the dispatch board (crew assignments, dates, tasks). Used by the AI to recall past schedules after jobs move.';

comment on column public.schedule_history.snapshot_date is
  'Arizona calendar day (YYYY-MM-DD). Primary key; upserted throughout that day.';

comment on column public.schedule_history.payload is
  'JSON: { version, jobs[{id,title,location,status,phase,service_type,date,end_date,crew,tasks}], time_off[] }.';

alter table public.schedule_history enable row level security;

revoke all on table public.schedule_history from anon, public;
grant select, insert, update, delete on table public.schedule_history to authenticated;
grant all on table public.schedule_history to service_role;

drop policy if exists schedule_history_read on public.schedule_history;
create policy schedule_history_read
  on public.schedule_history for select
  to authenticated
  using (true);

drop policy if exists schedule_history_insert on public.schedule_history;
create policy schedule_history_insert
  on public.schedule_history for insert
  to authenticated
  with check ("current_role"() = any (array['owner', 'crew']));

drop policy if exists schedule_history_update on public.schedule_history;
create policy schedule_history_update
  on public.schedule_history for update
  to authenticated
  using ("current_role"() = any (array['owner', 'crew']))
  with check ("current_role"() = any (array['owner', 'crew']));

drop policy if exists schedule_history_delete on public.schedule_history;
create policy schedule_history_delete
  on public.schedule_history for delete
  to authenticated
  using ("current_role"() = any (array['owner', 'crew']));
