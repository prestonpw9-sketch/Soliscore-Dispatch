-- Add covering indexes for foreign keys flagged by Supabase performance advisors.
-- job_technicians.job_id is already covered by its composite primary key.

create index if not exists idx_job_tasks_job_id
  on public.job_tasks (job_id);

create index if not exists idx_job_tasks_technician_id
  on public.job_tasks (technician_id);

create index if not exists idx_job_technicians_technician_id
  on public.job_technicians (technician_id);

create index if not exists idx_jobs_technician_id
  on public.jobs (technician_id);

create index if not exists idx_projects_builder_id
  on public.projects (builder_id);

create index if not exists idx_submittals_job_id
  on public.submittals (job_id);

create index if not exists idx_submittals_project_id
  on public.submittals (project_id);

create index if not exists idx_task_updates_job_id
  on public.task_updates (job_id);

create index if not exists idx_task_updates_job_task_id
  on public.task_updates (job_task_id);
