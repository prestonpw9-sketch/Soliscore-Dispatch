-- Documentation-only. Applied on the hosted project.
-- Trim cannot start until rough-in / top-out inspection has passed.

alter table public.jobs
  add column if not exists inspection_passed boolean not null default false;

comment on column public.jobs.inspection_passed is
  'True when rough-in / top-out inspection has passed. Required before advancing to Trim.';
