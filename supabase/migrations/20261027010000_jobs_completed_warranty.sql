-- NOT yet applied to the hosted project. Apply only with Preston's OK.
-- Completed / Under Warranty jobs.
--   * completed_at   — when the phase row was marked complete (null = open).
--   * warranty_until — last day of warranty coverage. Defaults to one year after
--                      completion, editable per job. Jobs are never auto-deleted.
--   * DELETE on public.jobs becomes owner-only. Crew keep insert/update
--     (complete / restore); office stays view-only.

alter table public.jobs
  add column if not exists completed_at timestamptz;

alter table public.jobs
  add column if not exists warranty_until date;

comment on column public.jobs.completed_at is
  'When this job (phase row) was marked completed. Null while open; cleared on restore.';
comment on column public.jobs.warranty_until is
  'Warranty coverage end date. Defaults to completed_at + 1 year; editable per job.';

-- Fill the default warranty when a job is completed without one. Restoring
-- (completed_at -> null) leaves warranty_until to the caller, which clears it.
create or replace function public.jobs_default_warranty_until()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.completed_at is not null and new.warranty_until is null then
    new.warranty_until := ((new.completed_at at time zone 'America/Phoenix')::date + interval '1 year')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_default_warranty_until on public.jobs;
create trigger jobs_default_warranty_until
  before insert or update of completed_at, warranty_until on public.jobs
  for each row
  execute function public.jobs_default_warranty_until();

-- No backfill: jobs completed before this migration keep completed_at null and
-- show as "Warranty date not set" until someone enters one.

-- Tighten DELETE to owner-only (was owner + crew via write_owner_crew_delete
-- in 20260705160000_optimize_rls_policies.sql).
drop policy if exists write_owner_crew_delete on public.jobs;
drop policy if exists jobs_owner_delete on public.jobs;

create policy jobs_owner_delete
  on public.jobs for delete
  to authenticated
  using (is_owner());
