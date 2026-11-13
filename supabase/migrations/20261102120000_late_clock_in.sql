-- NOT yet applied to the hosted project. Apply only with Preston's OK.
-- Do not run this file from CI or from the app.
-- Apply after 20261031020000_shift_segment_integrity.sql.
--
-- Late / off-site clock-in. Clock-in is never blocked by location. A worker
-- away from the shop, or after the normal start, can start now or say they
-- started earlier (same Phoenix day, not in the future, not before 4:00 AM).
-- No approval: the shift is flagged and payroll admins (Preston, Carol, Greg,
-- Squeaky) see the flag and can fix the start time, job, and segments, with
-- every change in payroll_edit_audit.
--
--   * shifts: clock_in_tapped_at (actual tap), clock_in_flags, clock_in_note,
--     start_job_id (job picked at clock-in), clock_in_reviewed_at/by
--   * time_segments: 'unverified' kind (claimed time with no location to
--     classify it; paid, flagged) and backfilled (rebuilt from saved points)
--   * payroll_settings: normal_start_time, late_grace_minutes,
--     backdate_earliest_time. Phones read these; until the read succeeds they
--     offer Start now only and write none of the new columns.
--   * shifts_clock_in_guard: a phone can add flags but never remove them,
--     and a claimed start is clamped to the bounds on the server too
--   * shifts.clock_in_received_at: the server's own time when the shift row
--     first arrived. Set by the trigger only (a phone can't set or change
--     it). Payroll compares it with the phone's tap time and flags a gap
--     larger than 45 minutes (a constant in _shared/payroll.ts, not a
--     setting) for review. Nothing is blocked, clamped, or rewritten, even
--     when the phone clock is ahead: offline phones sync late for real
--     reasons.
--   * shifts.clock_out_received_at: the same for the clock-out. Stamped the
--     first time a phone sends ended_at; payroll applies the same 45-minute
--     check and flags only.
--   * Saving clock times in payroll_edit_shift (or any payroll admin RPC
--     that edits a shift) also marks the clock-in reviewed
--   * payroll_review_clock_in RPC (payroll admins): start time, start job,
--     mark reviewed; audited
--   * payroll_edit_segment accepts 'unverified' so an admin can retime it
--     before reclassifying it
-- Idempotent: safe to run more than once.

-- ── Shifts ─────────────────────────────────────────────────────────────────

alter table public.shifts
  add column if not exists clock_in_tapped_at timestamptz;
alter table public.shifts
  add column if not exists clock_in_flags text[] not null default '{}';
alter table public.shifts
  add column if not exists clock_in_note text;
alter table public.shifts
  add column if not exists start_job_id bigint references public.jobs (id) on delete set null;
alter table public.shifts
  add column if not exists clock_in_reviewed_at timestamptz;
alter table public.shifts
  add column if not exists clock_in_reviewed_by uuid references auth.users (id) on delete set null;
alter table public.shifts
  add column if not exists clock_in_received_at timestamptz;
alter table public.shifts
  add column if not exists clock_out_received_at timestamptz;

alter table public.shifts drop constraint if exists shifts_clock_in_flags_check;
alter table public.shifts
  add constraint shifts_clock_in_flags_check
  check (clock_in_flags <@ array['late_clock_in', 'backdated', 'off_site_start', 'no_location']::text[]);

alter table public.shifts drop constraint if exists shifts_clock_in_note_length;
alter table public.shifts
  add constraint shifts_clock_in_note_length
  check (clock_in_note is null or char_length(clock_in_note) <= 1000);

comment on column public.shifts.clock_in_tapped_at is
  'When Start was actually tapped. Set only for a flagged start; started_at is the claimed start.';
comment on column public.shifts.clock_in_flags is
  'late_clock_in, backdated, off_site_start, no_location. Empty for a normal start at the shop.';
comment on column public.shifts.start_job_id is
  'Job picked at clock-in (on it, or driving to it). Optional.';
comment on column public.shifts.clock_in_received_at is
  'Server time when this shift row first reached the database. Set by shifts_clock_in_guard; never from the phone. Null for shifts from before this column.';
comment on column public.shifts.clock_out_received_at is
  'Server time when the phone''s clock-out (ended_at) first reached the database. Set by shifts_clock_in_guard; never from the phone. Null while open, for a clock-out set by a payroll admin, and for shifts closed before this column.';

create index if not exists shifts_flagged_idx
  on public.shifts (started_at desc)
  where clock_in_flags <> '{}';

-- ── Segments ───────────────────────────────────────────────────────────────

alter table public.time_segments drop constraint if exists time_segments_kind_check;
alter table public.time_segments
  add constraint time_segments_kind_check
  check (kind in ('shop', 'driving', 'job', 'lunch', 'unverified'));

alter table public.time_segments
  add column if not exists backfilled boolean not null default false;

comment on column public.time_segments.backfilled is
  'Rebuilt after a late clock-in from location points the phone had saved for the gap.';

-- ── Settings ───────────────────────────────────────────────────────────────

alter table public.payroll_settings
  add column if not exists normal_start_time time not null default '06:00';
alter table public.payroll_settings
  add column if not exists late_grace_minutes smallint not null default 5;
alter table public.payroll_settings
  add column if not exists backdate_earliest_time time not null default '04:00';

alter table public.payroll_settings drop constraint if exists payroll_settings_late_grace_range;
alter table public.payroll_settings
  add constraint payroll_settings_late_grace_range
  check (late_grace_minutes between 0 and 240);

-- ── Guard: phones can add flags, never clear them ──────────────────────────

create or replace function public.shifts_clock_in_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_earliest time;
  v_floor timestamptz;
  v_prev_end timestamptz;
begin
  -- Server receive time: stamped on the first insert, never changed after,
  -- whatever the phone (or an RPC) sends. On an upsert the INSERT stamp is
  -- discarded and the UPDATE keeps the original.
  if tg_op = 'INSERT' then
    new.clock_in_received_at := now();
  else
    new.clock_in_received_at := old.clock_in_received_at;
  end if;

  -- Clock-out receive time: stamped the first time a phone sends ended_at,
  -- never changed after (a stale "open" upsert from an outbox can't reset
  -- it). A clock-out set by a payroll admin RPC isn't a phone clock-out, so
  -- it isn't stamped; nor is a shift closed before this column existed.
  if tg_op = 'UPDATE' and (old.clock_out_received_at is not null or old.ended_at is not null) then
    new.clock_out_received_at := old.clock_out_received_at;
  elsif new.ended_at is null
    or coalesce(current_setting('app.payroll_edit', true), '') = 'on' then
    new.clock_out_received_at := null;
  else
    new.clock_out_received_at := now();
  end if;

  -- Payroll admin RPCs set this for their own transaction.
  if coalesce(current_setting('app.payroll_edit', true), '') = 'on' then
    -- Saving clock times in the payroll editor counts as reviewing the
    -- clock-in (payroll_edit_shift always sets owner_edited_at).
    if tg_op = 'UPDATE'
      and new.clock_in_reviewed_at is null
      and new.owner_edited_at is distinct from old.owner_edited_at then
      new.clock_in_reviewed_at := now();
      new.clock_in_reviewed_by := auth.uid();
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.clock_in_tapped_at := coalesce(old.clock_in_tapped_at, new.clock_in_tapped_at);
    new.clock_in_flags := array(
      select distinct flag
        from unnest(coalesce(old.clock_in_flags, '{}') || coalesce(new.clock_in_flags, '{}')) as flag
       order by flag
    );
    new.clock_in_note := coalesce(old.clock_in_note, new.clock_in_note);
    new.start_job_id := coalesce(old.start_job_id, new.start_job_id);
    new.clock_in_reviewed_at := old.clock_in_reviewed_at;
    new.clock_in_reviewed_by := old.clock_in_reviewed_by;
    if old.clock_in_tapped_at is not null then
      new.started_at := old.started_at;
    end if;
  else
    new.clock_in_reviewed_at := null;
    new.clock_in_reviewed_by := null;
  end if;

  if new.clock_in_tapped_at is not null then
    -- Not after the tap.
    if new.started_at > new.clock_in_tapped_at then
      new.started_at := new.clock_in_tapped_at;
    end if;
    -- Not before the earliest time on the tap's Phoenix day (default 4:00 AM).
    select coalesce(backdate_earliest_time, '04:00'::time) into v_earliest
      from public.payroll_settings where id;
    v_floor := (((new.clock_in_tapped_at at time zone 'America/Phoenix')::date)
      + coalesce(v_earliest, '04:00'::time)) at time zone 'America/Phoenix';
    if new.started_at < v_floor then
      new.started_at := v_floor;
    end if;
    -- Not overlapping an earlier shift of the same worker.
    select max(ended_at) into v_prev_end
      from public.shifts
     where user_id = new.user_id
       and id <> new.id
       and ended_at is not null
       and ended_at <= new.clock_in_tapped_at
       and ended_at > new.started_at;
    if v_prev_end is not null then
      new.started_at := v_prev_end;
    end if;
    if new.started_at < new.clock_in_tapped_at - interval '1 minute'
      and not ('backdated' = any (new.clock_in_flags)) then
      new.clock_in_flags := new.clock_in_flags || array['backdated'];
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists shifts_clock_in_guard on public.shifts;
create trigger shifts_clock_in_guard
  before insert or update on public.shifts
  for each row
  execute function public.shifts_clock_in_guard();

revoke all on function public.shifts_clock_in_guard() from public, anon, authenticated;

-- ── Payroll admin review ───────────────────────────────────────────────────

-- Fix a flagged clock-in: start time and/or picked job, and mark it reviewed.
-- Moving the start earlier moves the first segment's start with it, so the
-- added time is not lost. Moving it later is clipped by payroll math (and
-- the segment triggers). Only after clock-out, like the other payroll edits.
create or replace function public.payroll_review_clock_in(
  p_shift_id uuid,
  p_started_at timestamptz default null,
  p_start_job_id bigint default null,
  p_clear_start_job boolean default false,
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
  v_seg public.time_segments;
  v_seg_new public.time_segments;
begin
  if not public.is_payroll_admin() then
    raise exception 'Only a payroll admin can edit payroll.' using errcode = '42501';
  end if;
  select * into v_old from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'Shift not found.' using errcode = 'P0002';
  end if;
  if v_old.ended_at is null then
    raise exception 'The shift is still open on the phone. Review it after clock-out.' using errcode = '22023';
  end if;
  if p_started_at is not null and p_started_at > v_old.ended_at then
    raise exception 'Clock-in is after clock-out.' using errcode = '22023';
  end if;

  perform set_config('app.payroll_edit', 'on', true);
  update public.shifts set
    started_at = coalesce(p_started_at, v_old.started_at),
    start_job_id = case when p_clear_start_job then null else coalesce(p_start_job_id, v_old.start_job_id) end,
    clock_in_reviewed_at = now(),
    clock_in_reviewed_by = auth.uid(),
    owner_edited_at = now(),
    owner_edited_by = auth.uid(),
    updated_at = now()
  where id = p_shift_id
  returning * into v_new;

  if p_started_at is not null and p_started_at < v_old.started_at then
    select * into v_seg
      from public.time_segments
     where shift_id = p_shift_id
     order by started_at
     limit 1
     for update;
    if found and v_seg.started_at <= v_old.started_at then
      update public.time_segments set
        started_at = p_started_at,
        owner_edited_at = now(),
        owner_edited_by = auth.uid(),
        updated_at = now()
      where id = v_seg.id
      returning * into v_seg_new;
      insert into public.payroll_edit_audit
        (target_table, target_id, shift_id, worker_user_id, action, original_value, new_value, note, edited_by)
      values
        ('time_segments', v_seg.id, p_shift_id, v_old.user_id, 'update', to_jsonb(v_seg), to_jsonb(v_seg_new),
         coalesce(p_note, 'Moved with the reviewed clock-in'), auth.uid());
    end if;
  end if;
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

revoke execute on function public.payroll_review_clock_in(uuid, timestamptz, bigint, boolean, text) from public, anon;
grant execute on function public.payroll_review_clock_in(uuid, timestamptz, bigint, boolean, text) to authenticated;

-- ── payroll_edit_segment: allow 'unverified' ───────────────────────────────
-- Same approach as 20261030150000: rewrite the stored definition so the rest
-- of the function stays exactly as live. Skipped (with a notice) if the text
-- does not match, so the migration never half-applies a guess.
do $$
declare
  fn constant text := 'public.payroll_edit_segment(uuid,text,bigint,text,timestamptz,timestamptz,boolean,text)';
  def text;
begin
  def := pg_get_functiondef(fn::regprocedure);
  if position('''unverified''' in def) > 0 then
    return; -- already done
  end if;
  if position('if v_kind not in (''shop'', ''driving'', ''job'', ''lunch'') then' in def) = 0
    or position('if p_clear_job or v_kind in (''driving'', ''lunch'', ''shop'') then' in def) = 0
    or position('if v_kind = ''lunch'' then v_job_name := ''Lunch''; end if;' in def) = 0 then
    raise notice 'payroll_edit_segment text did not match; unverified segments must be reclassified before retiming.';
    return;
  end if;
  def := replace(def,
    'if v_kind not in (''shop'', ''driving'', ''job'', ''lunch'') then',
    'if v_kind not in (''shop'', ''driving'', ''job'', ''lunch'', ''unverified'') then');
  def := replace(def,
    'if p_clear_job or v_kind in (''driving'', ''lunch'', ''shop'') then',
    'if p_clear_job or v_kind in (''driving'', ''lunch'', ''shop'', ''unverified'') then');
  def := replace(def,
    'if v_kind = ''lunch'' then v_job_name := ''Lunch''; end if;',
    'if v_kind = ''lunch'' then v_job_name := ''Lunch''; end if;
  if v_kind = ''unverified'' then v_job_name := ''Unverified''; end if;');
  execute def;
end
$$;
