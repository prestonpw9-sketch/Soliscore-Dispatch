-- NOT yet applied to the hosted project. Apply only with Preston's OK.
-- Do not run this file from CI or from the app.
-- Apply after 20261029043709_shift_time_segments.sql.
--
-- Payroll on top of the shift tracker:
--   * 'lunch' segment kind (automatic unpaid lunch, default 11:00-11:30 AM Phoenix)
--   * payroll_settings: one company row (lunch window, pay week, overtime, alerts,
--     daily owner summary switch - off by default)
--   * owner edits go through security-definer RPCs that write payroll_edit_audit
--     (who, when, original value, new value) and clear approvals for that period
--   * payroll_approvals: owner approves a worker's day or week
--   * a phone replaying its outbox cannot undo an owner edit
--
-- RLS: workers read their own rows; owners read everything. Existing office
-- read access on shifts / time_segments is unchanged.

-- ── Lunch segment kind ─────────────────────────────────────────────────────

alter table public.time_segments drop constraint if exists time_segments_kind_check;
alter table public.time_segments
  add constraint time_segments_kind_check
  check (kind in ('shop', 'driving', 'job', 'lunch'));

comment on table public.time_segments is
  'Shop, driving, on-site (job), and lunch stretches inside a shift. Travel (driving) is separate from job time. Lunch is unpaid unless payroll_settings.lunch_paid.';

-- ── Settings ───────────────────────────────────────────────────────────────

create table if not exists public.payroll_settings (
  id boolean primary key default true,
  lunch_enabled boolean not null default true,
  lunch_start time not null default '11:00',
  lunch_end time not null default '11:30',
  lunch_paid boolean not null default false,
  -- 0 = Sunday ... 6 = Saturday. Default Monday, so the pay week is Mon-Sun.
  week_start_dow smallint not null default 1,
  overtime_weekly_hours numeric(5, 2) not null default 40,
  travel_alert_minutes integer not null default 90,
  daily_summary_enabled boolean not null default false,
  daily_summary_phone text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint payroll_settings_singleton check (id),
  constraint payroll_settings_lunch_order check (lunch_end > lunch_start),
  constraint payroll_settings_week_start_range check (week_start_dow between 0 and 6),
  constraint payroll_settings_overtime_range check (overtime_weekly_hours between 1 and 168),
  constraint payroll_settings_travel_alert_range check (travel_alert_minutes between 5 and 1440)
);

insert into public.payroll_settings (id) values (true)
  on conflict (id) do nothing;

comment on table public.payroll_settings is
  'One row. Lunch window (America/Phoenix), pay week start, overtime threshold, anomaly thresholds, daily owner summary switch.';

alter table public.payroll_settings enable row level security;
revoke all on public.payroll_settings from anon;
grant select, update on public.payroll_settings to authenticated;

drop policy if exists payroll_settings_select on public.payroll_settings;
drop policy if exists payroll_settings_update on public.payroll_settings;

-- Phones read the lunch window, so every signed-in role can read the row.
create policy payroll_settings_select
  on public.payroll_settings for select
  to authenticated
  using (true);

create policy payroll_settings_update
  on public.payroll_settings for update
  to authenticated
  using (is_owner())
  with check (is_owner());

-- ── Owner-edit markers ─────────────────────────────────────────────────────

alter table public.shifts
  add column if not exists owner_edited_at timestamptz;
alter table public.shifts
  add column if not exists owner_edited_by uuid references auth.users (id) on delete set null;

alter table public.time_segments
  add column if not exists owner_edited_at timestamptz;
alter table public.time_segments
  add column if not exists owner_edited_by uuid references auth.users (id) on delete set null;

-- A phone that replays an old queued upsert after the owner fixed the row
-- would otherwise put the old times back. Once owner_edited_at is set, only
-- the payroll RPCs (which set app.payroll_edit for their transaction) can
-- change the row. Other updates are dropped without an error so the phone's
-- outbox still clears.
create or replace function public.keep_owner_payroll_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.owner_edited_at is not null
    and coalesce(current_setting('app.payroll_edit', true), '') <> 'on' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists shifts_keep_owner_edits on public.shifts;
create trigger shifts_keep_owner_edits
  before update on public.shifts
  for each row
  execute function public.keep_owner_payroll_edits();

drop trigger if exists time_segments_keep_owner_edits on public.time_segments;
create trigger time_segments_keep_owner_edits
  before update on public.time_segments
  for each row
  execute function public.keep_owner_payroll_edits();

-- ── Audit ──────────────────────────────────────────────────────────────────

create table if not exists public.payroll_edit_audit (
  id bigint generated always as identity primary key,
  target_table text not null,
  target_id uuid not null,
  shift_id uuid,
  worker_user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  original_value jsonb,
  new_value jsonb,
  note text,
  edited_by uuid references auth.users (id) on delete set null,
  edited_at timestamptz not null default now(),
  constraint payroll_edit_audit_table_check check (target_table in ('shifts', 'time_segments')),
  constraint payroll_edit_audit_action_check check (action in ('update', 'insert', 'delete'))
);

create index if not exists payroll_edit_audit_worker_idx
  on public.payroll_edit_audit (worker_user_id, edited_at desc);
create index if not exists payroll_edit_audit_target_idx
  on public.payroll_edit_audit (target_id);

comment on table public.payroll_edit_audit is
  'Every owner payroll edit: who, when, the original row, and the new row. Written only by the payroll_* RPCs.';

alter table public.payroll_edit_audit enable row level security;
revoke all on public.payroll_edit_audit from anon;
grant select on public.payroll_edit_audit to authenticated;

drop policy if exists payroll_edit_audit_select on public.payroll_edit_audit;
create policy payroll_edit_audit_select
  on public.payroll_edit_audit for select
  to authenticated
  using (worker_user_id = (select auth.uid()) or is_owner());

-- ── Approvals ──────────────────────────────────────────────────────────────

create table if not exists public.payroll_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null,
  period_start date not null,
  approved_by uuid references auth.users (id) on delete set null default auth.uid(),
  approved_at timestamptz not null default now(),
  constraint payroll_approvals_period_check check (period in ('day', 'week')),
  constraint payroll_approvals_unique unique (user_id, period, period_start)
);

comment on table public.payroll_approvals is
  'Owner sign-off for a worker day (period_start = Phoenix date) or pay week (period_start = first day of the week). An owner edit inside the period removes the approval.';

alter table public.payroll_approvals enable row level security;
revoke all on public.payroll_approvals from anon;
grant select, insert, delete on public.payroll_approvals to authenticated;

drop policy if exists payroll_approvals_select on public.payroll_approvals;
drop policy if exists payroll_approvals_insert on public.payroll_approvals;
drop policy if exists payroll_approvals_delete on public.payroll_approvals;

create policy payroll_approvals_select
  on public.payroll_approvals for select
  to authenticated
  using (user_id = (select auth.uid()) or is_owner());

create policy payroll_approvals_insert
  on public.payroll_approvals for insert
  to authenticated
  with check (is_owner() and approved_by = (select auth.uid()));

create policy payroll_approvals_delete
  on public.payroll_approvals for delete
  to authenticated
  using (is_owner());

-- ── Helpers ────────────────────────────────────────────────────────────────

create or replace function public.payroll_work_date(p_at timestamptz)
returns date
language sql
stable
set search_path = public
as $$
  select (p_at at time zone 'America/Phoenix')::date;
$$;

create or replace function public.payroll_week_start(p_day date)
returns date
language sql
stable
set search_path = public
as $$
  select p_day - ((extract(dow from p_day)::int
    - coalesce((select week_start_dow from public.payroll_settings where id), 1) + 7) % 7);
$$;

-- Clears the day and week approvals that cover a shift's work date.
create or replace function public.payroll_clear_approvals(p_user_id uuid, p_started_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := public.payroll_work_date(p_started_at);
begin
  delete from public.payroll_approvals
    where user_id = p_user_id
      and ((period = 'day' and period_start = v_day)
        or (period = 'week' and period_start = public.payroll_week_start(v_day)));
end;
$$;

-- ── Owner edit RPCs ────────────────────────────────────────────────────────

-- Edit times, kind, or job of one segment. Null arguments keep the current
-- value. p_clear_job = true removes the job link.
create or replace function public.payroll_edit_segment(
  p_segment_id uuid,
  p_kind text default null,
  p_job_id bigint default null,
  p_job_name text default null,
  p_started_at timestamptz default null,
  p_ended_at timestamptz default null,
  p_clear_job boolean default false,
  p_note text default null
)
returns public.time_segments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.time_segments;
  v_new public.time_segments;
  v_shift public.shifts;
  v_kind text;
  v_job_id bigint;
  v_job_name text;
begin
  if not is_owner() then
    raise exception 'Only an owner can edit payroll.' using errcode = '42501';
  end if;

  select * into v_old from public.time_segments where id = p_segment_id for update;
  if not found then
    raise exception 'Segment not found.' using errcode = 'P0002';
  end if;
  select * into v_shift from public.shifts where id = v_old.shift_id;
  if v_shift.ended_at is null then
    raise exception 'The shift is still open on the phone. Edit it after clock-out.' using errcode = '22023';
  end if;

  v_kind := coalesce(p_kind, v_old.kind);
  if v_kind not in ('shop', 'driving', 'job', 'lunch') then
    raise exception 'Unknown segment kind %.', v_kind using errcode = '22023';
  end if;

  if p_clear_job or v_kind in ('driving', 'lunch', 'shop') then
    v_job_id := null;
  else
    v_job_id := coalesce(p_job_id, v_old.job_id);
  end if;

  if v_job_id is not null and p_job_id is not null and p_job_name is null then
    select coalesce(nullif(trim(title), ''), 'Job') into v_job_name from public.jobs where id = v_job_id;
  else
    v_job_name := coalesce(p_job_name, v_old.job_name);
  end if;
  if v_kind = 'driving' then v_job_name := null; end if;
  if v_kind = 'lunch' then v_job_name := 'Lunch'; end if;
  if v_kind = 'shop' then
    v_job_name := case when v_old.kind = 'shop' then coalesce(v_old.job_name, 'Shop') else 'Shop' end;
  end if;

  if coalesce(p_ended_at, v_old.ended_at) is not null
    and coalesce(p_ended_at, v_old.ended_at) < coalesce(p_started_at, v_old.started_at) then
    raise exception 'End time is before start time.' using errcode = '22023';
  end if;

  perform set_config('app.payroll_edit', 'on', true);
  update public.time_segments set
    kind = v_kind,
    job_id = v_job_id,
    job_name = v_job_name,
    started_at = coalesce(p_started_at, v_old.started_at),
    ended_at = coalesce(p_ended_at, v_old.ended_at),
    owner_edited_at = now(),
    owner_edited_by = auth.uid(),
    updated_at = now()
  where id = p_segment_id
  returning * into v_new;
  perform set_config('app.payroll_edit', '', true);

  insert into public.payroll_edit_audit
    (target_table, target_id, shift_id, worker_user_id, action, original_value, new_value, note, edited_by)
  values
    ('time_segments', v_old.id, v_old.shift_id, v_old.user_id, 'update', to_jsonb(v_old), to_jsonb(v_new), p_note, auth.uid());

  perform public.payroll_clear_approvals(v_old.user_id, v_shift.started_at);
  return v_new;
end;
$$;

-- Add a segment the phone missed (for example a lunch the crew did not take
-- at 11:00, or a job stop with no pin).
create or replace function public.payroll_insert_segment(
  p_shift_id uuid,
  p_kind text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_job_id bigint default null,
  p_job_name text default null,
  p_note text default null
)
returns public.time_segments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
  v_new public.time_segments;
  v_job_name text := p_job_name;
begin
  if not is_owner() then
    raise exception 'Only an owner can edit payroll.' using errcode = '42501';
  end if;
  select * into v_shift from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'Shift not found.' using errcode = 'P0002';
  end if;
  if v_shift.ended_at is null then
    raise exception 'The shift is still open on the phone. Edit it after clock-out.' using errcode = '22023';
  end if;
  if p_kind not in ('shop', 'driving', 'job', 'lunch') then
    raise exception 'Unknown segment kind %.', p_kind using errcode = '22023';
  end if;
  if p_ended_at < p_started_at then
    raise exception 'End time is before start time.' using errcode = '22023';
  end if;
  if p_kind = 'job' and p_job_id is not null and v_job_name is null then
    select coalesce(nullif(trim(title), ''), 'Job') into v_job_name from public.jobs where id = p_job_id;
  end if;
  if p_kind = 'lunch' then v_job_name := 'Lunch'; end if;
  if p_kind = 'shop' then v_job_name := coalesce(v_job_name, 'Shop'); end if;
  if p_kind = 'driving' then v_job_name := null; end if;

  insert into public.time_segments
    (id, shift_id, user_id, kind, job_id, job_name, started_at, ended_at, owner_edited_at, owner_edited_by, updated_at)
  values
    (gen_random_uuid(), p_shift_id, v_shift.user_id, p_kind,
     case when p_kind = 'job' then p_job_id else null end,
     v_job_name, p_started_at, p_ended_at, now(), auth.uid(), now())
  returning * into v_new;

  insert into public.payroll_edit_audit
    (target_table, target_id, shift_id, worker_user_id, action, original_value, new_value, note, edited_by)
  values
    ('time_segments', v_new.id, p_shift_id, v_shift.user_id, 'insert', null, to_jsonb(v_new), p_note, auth.uid());

  perform public.payroll_clear_approvals(v_shift.user_id, v_shift.started_at);
  return v_new;
end;
$$;

create or replace function public.payroll_delete_segment(
  p_segment_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.time_segments;
  v_shift public.shifts;
begin
  if not is_owner() then
    raise exception 'Only an owner can edit payroll.' using errcode = '42501';
  end if;
  select * into v_old from public.time_segments where id = p_segment_id for update;
  if not found then
    raise exception 'Segment not found.' using errcode = 'P0002';
  end if;
  select * into v_shift from public.shifts where id = v_old.shift_id;
  if v_shift.ended_at is null then
    raise exception 'The shift is still open on the phone. Edit it after clock-out.' using errcode = '22023';
  end if;

  delete from public.time_segments where id = p_segment_id;

  insert into public.payroll_edit_audit
    (target_table, target_id, shift_id, worker_user_id, action, original_value, new_value, note, edited_by)
  values
    ('time_segments', v_old.id, v_old.shift_id, v_old.user_id, 'delete', to_jsonb(v_old), null, p_note, auth.uid());

  perform public.payroll_clear_approvals(v_old.user_id, v_shift.started_at);
end;
$$;

-- Correct clock-in / clock-out. end_reason stays as recorded so an
-- auto-stopped shift is still visible as one; owner_edited_at marks the fix.
create or replace function public.payroll_edit_shift(
  p_shift_id uuid,
  p_started_at timestamptz default null,
  p_ended_at timestamptz default null,
  p_note text default null
)
returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.shifts;
  v_new public.shifts;
begin
  if not is_owner() then
    raise exception 'Only an owner can edit payroll.' using errcode = '42501';
  end if;
  select * into v_old from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'Shift not found.' using errcode = 'P0002';
  end if;
  if v_old.ended_at is null and p_ended_at is null then
    raise exception 'The shift is still open on the phone. Set a clock-out time or wait for clock-out.' using errcode = '22023';
  end if;
  if coalesce(p_ended_at, v_old.ended_at) < coalesce(p_started_at, v_old.started_at) then
    raise exception 'Clock-out is before clock-in.' using errcode = '22023';
  end if;

  perform set_config('app.payroll_edit', 'on', true);
  update public.shifts set
    started_at = coalesce(p_started_at, v_old.started_at),
    ended_at = coalesce(p_ended_at, v_old.ended_at),
    end_reason = coalesce(v_old.end_reason, 'clock_out'),
    owner_edited_at = now(),
    owner_edited_by = auth.uid(),
    updated_at = now()
  where id = p_shift_id
  returning * into v_new;
  perform set_config('app.payroll_edit', '', true);

  insert into public.payroll_edit_audit
    (target_table, target_id, shift_id, worker_user_id, action, original_value, new_value, note, edited_by)
  values
    ('shifts', v_old.id, v_old.id, v_old.user_id, 'update', to_jsonb(v_old), to_jsonb(v_new), p_note, auth.uid());

  perform public.payroll_clear_approvals(v_old.user_id, v_old.started_at);
  if public.payroll_work_date(v_new.started_at) <> public.payroll_work_date(v_old.started_at) then
    perform public.payroll_clear_approvals(v_old.user_id, v_new.started_at);
  end if;
  return v_new;
end;
$$;

revoke execute on function public.payroll_clear_approvals(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.payroll_edit_segment(uuid, text, bigint, text, timestamptz, timestamptz, boolean, text) from public, anon;
revoke execute on function public.payroll_insert_segment(uuid, text, timestamptz, timestamptz, bigint, text, text) from public, anon;
revoke execute on function public.payroll_delete_segment(uuid, text) from public, anon;
revoke execute on function public.payroll_edit_shift(uuid, timestamptz, timestamptz, text) from public, anon;

grant execute on function public.payroll_edit_segment(uuid, text, bigint, text, timestamptz, timestamptz, boolean, text) to authenticated;
grant execute on function public.payroll_insert_segment(uuid, text, timestamptz, timestamptz, bigint, text, text) to authenticated;
grant execute on function public.payroll_delete_segment(uuid, text) to authenticated;
grant execute on function public.payroll_edit_shift(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.payroll_work_date(timestamptz) to authenticated;
grant execute on function public.payroll_week_start(date) to authenticated;
