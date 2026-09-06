-- Documentation-only in-repo. Applied on the hosted project.
-- Per-user Comm Matrix last-seen timestamps + AI-scheduled job alerts.

create table if not exists public.dispatch_inbox_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages_seen_at timestamptz not null default now(),
  alerts_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dispatch_schedule_alerts (
  id uuid primary key default gen_random_uuid(),
  job_id bigint references public.jobs(id) on delete set null,
  title text not null,
  location text,
  scheduled_date text not null,
  scheduled_end_date text,
  phone_number text,
  created_at timestamptz not null default now()
);

create index if not exists dispatch_schedule_alerts_created_at_idx
  on public.dispatch_schedule_alerts (created_at desc);

comment on table public.dispatch_inbox_state is
  'Per-user last-seen for Comm Matrix unread SMS and AI job-booked alerts.';
comment on table public.dispatch_schedule_alerts is
  'One row each time the superintendent SMS AI puts a job on the board.';

alter table public.dispatch_inbox_state enable row level security;
alter table public.dispatch_schedule_alerts enable row level security;

drop policy if exists dispatch_inbox_state_select_own on public.dispatch_inbox_state;
drop policy if exists dispatch_inbox_state_insert_own on public.dispatch_inbox_state;
drop policy if exists dispatch_inbox_state_update_own on public.dispatch_inbox_state;
drop policy if exists dispatch_schedule_alerts_read_all on public.dispatch_schedule_alerts;

create policy dispatch_inbox_state_select_own
  on public.dispatch_inbox_state for select to authenticated
  using (user_id = (select auth.uid()));

create policy dispatch_inbox_state_insert_own
  on public.dispatch_inbox_state for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy dispatch_inbox_state_update_own
  on public.dispatch_inbox_state for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy dispatch_schedule_alerts_read_all
  on public.dispatch_schedule_alerts for select to authenticated
  using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dispatch_schedule_alerts'
  ) then
    alter publication supabase_realtime add table public.dispatch_schedule_alerts;
  end if;
end $$;
