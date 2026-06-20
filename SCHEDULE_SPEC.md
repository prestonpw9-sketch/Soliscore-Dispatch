# Smartsheet-Style Schedule Overhaul — ITDG Plumbing

Replace the 3 separate scheduling pages with ONE unified "Schedule" — a Smartsheet-style
crew board with multi-day job bars, per-crew task rows, and daily completion tracking.
Full-day work only (NO times of day anywhere).

## DB already created (DO NOT recreate)
- jobs: has `date` (start), `end_date`, `technician_id`, `technician_ids uuid[]`, `phase`,
  and NEW `service_type text`. Jobs id is bigint.
- NEW `job_tasks` (id uuid, job_id bigint, technician_id uuid, task text, start_date text,
  end_date text, status text ['not_started','in_progress','complete','behind'],
  percent_complete int, created_at).
- NEW `task_updates` (id uuid, job_task_id uuid, job_id bigint, update_date text, note text,
  percent_complete int, created_by uuid, created_at) — daily completion log.
- NEW `submittals` (id uuid, job_id bigint, project_id uuid, name text, file_path text,
  status text, created_at). Storage bucket 'submittals' exists (public read, owner/crew write).
- `builders` (id, name) and `projects` (id, builder_id, name, address, status) already exist.
- Dates are stored as 'YYYY-MM-DD' text. RLS: read=any authed, write=owner/crew (office read-only).

## NEW unified "Schedule" page (replaces Weekly Calendar + Crew Schedule + Daily Tasks)
Create src/components/ScheduleBoard.tsx. In Sidebar NAV_ITEMS + AppLayout, REMOVE the
'calendar', 'schedule', and 'tasks' views and ADD a single 'schedule' view labeled
"Schedule" (icon CalendarRange). Update ViewKey types in src/components/Sidebar.tsx and
src/components/types.ts (remove calendar/tasks, keep schedule). Remove now-unused imports of
CalendarView/TechSchedule/TasksView from AppLayout (leave the component files on disk, just
stop routing to them). Page title in AppLayout titles map: schedule => "Schedule" /
"Plan crews across jobs and track daily progress".

### View
- A horizontal day timeline (Smartsheet style). Columns = days. Toggle button: "Month" vs
  "Timeline". Month = current month's days; Timeline = a scrollable ~4-week range. Prev/Next
  arrows move by month (or by 2 weeks in timeline). A "Today" button. Show month/year header.
- NO time-of-day. Days only.

### Rows / structure (grouped)
- Group by JOB. Each job is a group header row showing: job title/customer, service_type
  badge, date range, and a colored BAR spanning its start_date..end_date across the day columns.
- Under each job: ONE ROW PER ASSIGNED CREW MEMBER (from job_tasks; if a crew member on the
  job has no task row yet, show them with an empty editable task). Each crew row shows:
  crew name, an editable TASK text ("running water overhead", "roof drains", "water in walls"),
  that crew member's own date span bar (job_tasks.start_date..end_date, default to job range),
  a % complete, and a status pill (Not started / In progress / Complete / Behind).
- A job with 3 crew = 3 task rows. Adding a crew member to the job adds a row.

### Editing (owner/crew can edit; office is read-only — disable inputs if !canEdit from useAuth)
- Add/subtract days: edit a job's start/end date (date inputs in a job detail popover) OR
  drag the bar edges if feasible; date-input editing is the required baseline, drag is bonus.
  Saving updates jobs.date / jobs.end_date.
- Add more crew to a job (multi-select, reuse existing technicians list) -> creates job_tasks
  rows. Remove crew -> deletes their job_task row. Move a crew member to another job =
  reassign their job_task to a different job (a simple "move to job" dropdown is fine).
- Per-crew task text + that row's start/end date + percent editable inline.

### Daily tracking (core)
- Each crew row has a "Log today" action: opens a small form to record update_date (default
  today), a note of what they completed, and updated percent_complete. Writes task_updates AND
  updates job_tasks.percent_complete/status. Show the latest update note inline.
- On-schedule indicator: compute expected % = days elapsed / total days of that task's range.
  If percent_complete + small buffer < expected => mark row "Behind" (red). If complete =>
  teal/green. Show a clear job-level rollup: "On schedule" (teal) or "Behind schedule" (red)
  based on whether any crew row is behind. This is the whole point — Preston needs to glance
  and see if a job is on track.

### Color language: teal/indigo = on-track/save/add, red = behind/remove/delete. Dark-mode friendly.

## QuickAddJobModal changes
- Add START date + END date (multi-day). Default end = start. Allow any date, any month.
- Add SERVICE TYPE dropdown: Rough, Top-out, Trim, Service Call, Inspection, Pre-slab
  (save to jobs.service_type). Keep existing multi-crew select.
- Remove start/end TIME fields from the form (jobs are full-day). It's fine to leave
  startTime/endTime defaulting in code, just remove them from the UI.
- On create, also create job_tasks rows for each selected crew (task='', dates=job range).

## Customer Database: builder -> multiple projects
- In src/components/CustomersDatabase.tsx (or whatever the customers view component is —
  find it), add the ability under a builder/customer to add MULTIPLE projects (uses existing
  projects table with builder_id). Show each builder with a list of their projects and an
  "Add Project" action (name + address). If the current customers view maps to `customers`
  table not `builders`, ADD a Builders/Projects section or tab that uses builders+projects.
  Keep it simple and working.

## Submittals attached to a job
- There is a submittals folder/modal already referenced but it can't add+attach. Find it
  (search 'submittal' / 'Submittal'). Implement: upload a file to the 'submittals' storage
  bucket and create a submittals row linked to a job_id (a job picker dropdown of existing
  jobs). List submittals grouped by job with open/download + delete. Mirror how
  BlueprintsModal.tsx does storage upload/list/delete.

## Data layer (src/hooks/useDispatchData.ts)
- fetchJobs: also map service_type, end_date (endDate), keep technicianIds.
- Add fetches + mutations for job_tasks and task_updates (or do focused supabase calls inside
  ScheduleBoard — your call, keep it clean). Add createJob writing date,end_date,service_type,
  technician_ids and creating job_tasks for each crew.

## Component file names (confirmed)
- Customers view = src/components/CustomersView.tsx
- There is NO submittals modal yet. CREATE src/components/SubmittalsModal.tsx modeled on
  src/components/BlueprintsModal.tsx (storage upload/list/delete) but add a JOB PICKER so each
  submittal is linked to a job_id in the submittals table. Wire it to whatever currently opens
  'Submittals' (search StatsCards.tsx / Sidebar.tsx for the Submittals entry point) — make that
  button open the new SubmittalsModal.
- Schedule board = NEW src/components/ScheduleBoard.tsx
- Routing/nav = src/components/AppLayout.tsx, src/components/Sidebar.tsx, src/components/types.ts
- Add-job = src/components/QuickAddJobModal.tsx

## Constraints
- '@/' alias=./src/*. If importing lucide Map icon alias as MapIcon.
- MUST pass `./node_modules/.bin/tsc --noEmit` and `npm run build`. Fix all errors. Guard
  optional fields (technicianIds ?? []). Run npm install if needed.
- noEmit true; no stray .js in src.
- Do NOT touch auth/roles/RLS logic, the estimator, or proposal generator.
- Do NOT commit or push. Report files changed, what was removed from nav, and how daily
  tracking + on-schedule detection works.
