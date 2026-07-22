-- Allow starring 1st and 2nd stops (up to two ranked jobs per tech per day).
-- Existing rows keep stop_rank = 1 (first stop).

alter table public.tech_daily_priorities
  add column if not exists stop_rank smallint not null default 1;

alter table public.tech_daily_priorities
  drop constraint if exists tech_daily_priorities_stop_rank_check;

alter table public.tech_daily_priorities
  add constraint tech_daily_priorities_stop_rank_check
  check (stop_rank in (1, 2));

alter table public.tech_daily_priorities
  drop constraint if exists tech_daily_priorities_pkey;

alter table public.tech_daily_priorities
  add constraint tech_daily_priorities_pkey
  primary key (technician_id, work_date, stop_rank);

create unique index if not exists tech_daily_priorities_job_unique
  on public.tech_daily_priorities (technician_id, work_date, job_id);
