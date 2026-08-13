-- T&M job log fields + improve short-name job→project linking (e.g. DCS → DCS Mesa).
-- Documentation + runnable against the hosted project.

alter table public.jobs
  add column if not exists tm_enabled boolean not null default false;

alter table public.jobs
  add column if not exists tm_approved_by text null;

alter table public.jobs
  add column if not exists tm_work_description text null;

alter table public.jobs
  add column if not exists tm_hours numeric null;

comment on column public.jobs.tm_enabled is
  'True when this job is T&M (time & materials). Reveals approval + hours log in the UI.';
comment on column public.jobs.tm_approved_by is
  'Name of the person who approved the T&M work.';
comment on column public.jobs.tm_work_description is
  'Description of T&M work performed.';
comment on column public.jobs.tm_hours is
  'Hours committed / billed for T&M work.';

-- Flag existing T&M-phase jobs.
update public.jobs
set tm_enabled = true
where tm_enabled = false
  and (
    lower(coalesce(phase, '')) in ('t&m', 't and m', 'tm')
    or lower(coalesce(service_type, '')) in ('t&m', 't and m', 'tm')
  );

-- Link short job titles that are a prefix of a project name (DCS → DCS Mesa).
update public.jobs j
set project_id = p.id,
    customer_id = coalesce(j.customer_id, p.builder_id)
from public.projects p
where j.project_id is null
  and length(regexp_replace(lower(coalesce(j.title, j."customerName", '')), '[^a-z0-9]', '', 'g')) >= 3
  and regexp_replace(lower(p.name), '[^a-z0-9]', '', 'g')
      like regexp_replace(lower(coalesce(j.title, j."customerName", '')), '[^a-z0-9]', '', 'g') || '%'
  and (j.customer_id is null or j.customer_id = p.builder_id);

update public.jobs j
set customer_id = p.builder_id
from public.projects p
where j.project_id = p.id
  and p.builder_id is not null
  and (j.customer_id is null or j.customer_id <> p.builder_id);
