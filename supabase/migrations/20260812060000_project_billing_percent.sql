-- Track partial (percentage) billing within each 40/40/20 milestone instead of
-- a simple billed/not-billed flag, so office can invoice e.g. 50% of the
-- Rough-In 40% now and the rest later.
-- Documentation + runnable against the hosted project.

alter table public.projects
  add column if not exists rough_billed_pct smallint not null default 0
    check (rough_billed_pct between 0 and 100);

alter table public.projects
  add column if not exists topout_billed_pct smallint not null default 0
    check (topout_billed_pct between 0 and 100);

alter table public.projects
  add column if not exists trim_billed_pct smallint not null default 0
    check (trim_billed_pct between 0 and 100);

comment on column public.projects.rough_billed_pct is
  'Percent (0-100) of the Rough-In 40% milestone invoiced so far.';
comment on column public.projects.topout_billed_pct is
  'Percent (0-100) of the Top-Out 40% milestone invoiced so far.';
comment on column public.projects.trim_billed_pct is
  'Percent (0-100) of the Trim 20% milestone invoiced so far.';

-- Migrate the old all-or-nothing flags: billed -> 100%, not billed -> 0%.
update public.projects
set rough_billed_pct = case when rough_billed then 100 else 0 end,
    topout_billed_pct = case when topout_billed then 100 else 0 end,
    trim_billed_pct = case when trim_billed then 100 else 0 end
where rough_billed_pct = 0 and topout_billed_pct = 0 and trim_billed_pct = 0;

alter table public.projects drop column if exists rough_billed;
alter table public.projects drop column if exists topout_billed;
alter table public.projects drop column if exists trim_billed;
