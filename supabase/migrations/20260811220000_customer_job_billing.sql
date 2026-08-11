-- Link jobs to customers/projects and track 40/40/20 phase billing on projects.
-- Documentation + runnable against the hosted project.

-- ── jobs: customer + project FKs ───────────────────────────────────────────

alter table public.jobs
  add column if not exists customer_id uuid null references public.customers(id) on delete set null;

alter table public.jobs
  add column if not exists project_id uuid null references public.projects(id) on delete set null;

create index if not exists idx_jobs_customer_id on public.jobs (customer_id);
create index if not exists idx_jobs_project_id on public.jobs (project_id);

comment on column public.jobs.customer_id is
  'Optional FK to customers (builders share the same id). Used by Customers Database.';
comment on column public.jobs.project_id is
  'Optional FK to projects. Used for per-site billing progress.';

-- ── projects: contract + 40/40/20 billing milestones ────────────────────────

alter table public.projects
  add column if not exists contract_amount numeric null;

alter table public.projects
  add column if not exists rough_billed boolean not null default false;

alter table public.projects
  add column if not exists topout_billed boolean not null default false;

alter table public.projects
  add column if not exists trim_billed boolean not null default false;

alter table public.projects
  add column if not exists rough_bill_by date null;

alter table public.projects
  add column if not exists topout_bill_by date null;

alter table public.projects
  add column if not exists trim_bill_by date null;

comment on column public.projects.contract_amount is
  'Total contract value. Billed in phases: Rough 40%, Top-out 40%, Trim 20%.';
comment on column public.projects.rough_billed is 'True when the 40% rough-in invoice has been sent.';
comment on column public.projects.topout_billed is 'True when the 40% top-out invoice has been sent.';
comment on column public.projects.trim_billed is 'True when the 20% trim invoice has been sent.';
comment on column public.projects.rough_bill_by is 'Target date to send the rough-in invoice (typically 15–30 days before work).';
comment on column public.projects.topout_bill_by is 'Target date to send the top-out invoice.';
comment on column public.projects.trim_bill_by is 'Target date to send the trim invoice.';

-- ── Backfill: link jobs → customers by builder/customer name ───────────────

update public.jobs j
set customer_id = c.id
from public.customers c
where j.customer_id is null
  and length(trim(c.name)) >= 3
  and (
    lower(coalesce(j.title, '')) like '%' || lower(c.name) || '%'
    or lower(coalesce(j."customerName", '')) like '%' || lower(c.name) || '%'
  );

-- ── Backfill: link jobs → projects by normalized name match ────────────────
-- Prefer matches within the same builder when customer_id is already set.

update public.jobs j
set project_id = p.id,
    customer_id = coalesce(j.customer_id, p.builder_id)
from public.projects p
where j.project_id is null
  and length(trim(p.name)) >= 2
  and (
    -- exact-ish: strip spaces/#/- for comparison
    regexp_replace(lower(coalesce(j.title, j."customerName", '')), '[^a-z0-9]', '', 'g')
      like '%' || regexp_replace(lower(p.name), '[^a-z0-9]', '', 'g') || '%'
    or regexp_replace(lower(coalesce(j.title, j."customerName", '')), '[^a-z0-9]', '', 'g')
      = regexp_replace(lower(p.name), '[^a-z0-9]', '', 'g')
    -- Stone Canyon lot shorthand: project "SC#571" ↔ job "Stone Canyon 571-Trim"
    or (
      lower(p.name) ~ '^sc#?[0-9]+'
      and regexp_replace(lower(coalesce(j.title, j."customerName", '')), '[^a-z0-9]', '', 'g')
        like '%' || regexp_replace(lower(p.name), '[^0-9]', '', 'g') || '%'
      and (
        lower(coalesce(j.title, '')) like '%stone canyon%'
        or lower(coalesce(j.title, '')) like '%sc#%'
        or lower(coalesce(j.title, '')) like '%sc %'
        or lower(coalesce(j."customerName", '')) like '%sc#%'
      )
    )
  )
  and (j.customer_id is null or j.customer_id = p.builder_id);

-- When a project match exists, ensure customer_id follows the builder.
update public.jobs j
set customer_id = p.builder_id
from public.projects p
where j.project_id = p.id
  and p.builder_id is not null
  and (j.customer_id is null or j.customer_id <> p.builder_id);
