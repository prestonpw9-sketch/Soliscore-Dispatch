-- Documentation-only (hosted schema is source of truth).
-- Unify job status language: drop legacy "pending" in favor of "scheduled".
-- Canonical values: scheduled | active | completed

update public.jobs
set status = 'scheduled'
where lower(status) in ('pending', 'scheduled');

-- Leave active / completed untouched (case-normalized if needed):
update public.jobs
set status = 'active'
where lower(status) = 'active' and status <> 'active';

update public.jobs
set status = 'completed'
where lower(status) = 'completed' and status <> 'completed';
