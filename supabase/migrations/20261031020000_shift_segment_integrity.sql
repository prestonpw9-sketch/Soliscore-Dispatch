-- NOT yet applied to the hosted project. Apply only with Preston's OK.
-- Do not run this file from CI or from the app.
--
-- Server-side backstop for time_segments, so a phone running an older build
-- (or a lost local copy) cannot leave rows open or overlapping:
--   1. When a shift gets its clock-out (ended_at), every open segment in it
--      closes at that time, and none runs past it.
--   2. A segment written for an ended shift is cut to the clock-out, and a
--      segment never starts before its shift's clock-in.
--   3. Starting a new segment closes any earlier open segment in that shift
--      at the new segment's start.
-- Owner-edited rows are left alone (keep_owner_payroll_edits still applies).

create or replace function public.time_segments_clamp_to_shift()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
begin
  select * into v_shift from public.shifts where id = new.shift_id;
  if not found then
    return new;
  end if;
  if new.started_at < v_shift.started_at then
    new.started_at := v_shift.started_at;
  end if;
  if v_shift.ended_at is not null then
    if new.started_at > v_shift.ended_at then
      new.started_at := v_shift.ended_at;
    end if;
    if new.ended_at is null or new.ended_at > v_shift.ended_at then
      new.ended_at := v_shift.ended_at;
    end if;
  end if;
  if new.ended_at is not null and new.ended_at < new.started_at then
    new.ended_at := new.started_at;
  end if;
  return new;
end;
$$;

drop trigger if exists time_segments_clamp_to_shift on public.time_segments;
create trigger time_segments_clamp_to_shift
  before insert or update on public.time_segments
  for each row
  execute function public.time_segments_clamp_to_shift();

create or replace function public.time_segments_close_previous()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.time_segments
     set ended_at = new.started_at,
         updated_at = now()
   where shift_id = new.shift_id
     and id <> new.id
     and ended_at is null
     and started_at <= new.started_at;
  return null;
end;
$$;

drop trigger if exists time_segments_close_previous on public.time_segments;
create trigger time_segments_close_previous
  after insert on public.time_segments
  for each row
  execute function public.time_segments_close_previous();

create or replace function public.shifts_close_segments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ended_at is not null
    and (old.ended_at is null or new.ended_at is distinct from old.ended_at) then
    update public.time_segments
       set ended_at = new.ended_at,
           updated_at = now()
     where shift_id = new.id
       and (ended_at is null or ended_at > new.ended_at);
  end if;
  return null;
end;
$$;

drop trigger if exists shifts_close_segments on public.shifts;
create trigger shifts_close_segments
  after insert or update of ended_at on public.shifts
  for each row
  execute function public.shifts_close_segments();

revoke all on function public.time_segments_clamp_to_shift() from public, anon, authenticated;
revoke all on function public.time_segments_close_previous() from public, anon, authenticated;
revoke all on function public.shifts_close_segments() from public, anon, authenticated;
