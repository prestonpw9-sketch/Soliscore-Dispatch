/**
 * Payroll timesheet math: hours by kind and job, lunch deduction, weekly
 * overtime, anomaly flags, CSV export, and the daily summary text.
 * Does not call Supabase or the network.
 *
 * Run: npm run test:payroll
 */
import assert from 'node:assert/strict';
import {
  buildPayroll,
  dailySummaryText,
  DEFAULT_PAYROLL_SETTINGS,
  payrollCsv,
  payPeriodFor,
  payrollSettingsFromRow,
  phoenixWorkDate,
  weekStartFor,
  type PayrollJobInfo,
  type PayrollSegmentRow,
  type PayrollShiftRow,
} from '../supabase/functions/_shared/payroll.ts';

const t = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-07:00`).toISOString();
const USER = 'user-a';

let segCount = 0;
function seg(
  shiftId: string,
  day: string,
  kind: PayrollSegmentRow['kind'],
  from: string,
  to: string | null,
  job: { id: number; name: string } | null = null,
  user = USER,
): PayrollSegmentRow {
  return {
    id: `seg-${++segCount}`,
    shift_id: shiftId,
    user_id: user,
    kind,
    job_id: job?.id ?? null,
    job_name: kind === 'lunch' ? 'Lunch' : kind === 'shop' ? 'Shop' : job?.name ?? null,
    started_at: t(day, from),
    ended_at: to ? t(day, to) : null,
  };
}

const JOB_A = { id: 101, name: 'Congress Site' };
const JOB_B = { id: 202, name: 'Unpinned Remodel' };
const jobs = new Map<string, PayrollJobInfo>([
  ['101', { id: '101', name: 'Congress Site', pinned: true }],
  ['202', { id: '202', name: 'Unpinned Remodel', pinned: false }],
]);

/** One full day: 7:00 shop → auto-stop 17:00 = 9.5 h paid with 30 min unpaid lunch. */
function fullDay(day: string, shiftId: string, user = USER): { shift: PayrollShiftRow; segments: PayrollSegmentRow[] } {
  return {
    shift: { id: shiftId, user_id: user, started_at: t(day, '07:00'), ended_at: t(day, '17:00'), end_reason: 'auto_stop' },
    segments: [
      seg(shiftId, day, 'shop', '07:00', '07:30', null, user),
      seg(shiftId, day, 'driving', '07:30', '08:00', null, user),
      seg(shiftId, day, 'job', '08:00', '11:00', JOB_A, user),
      seg(shiftId, day, 'lunch', '11:00', '11:30', null, user),
      seg(shiftId, day, 'job', '11:30', '14:00', JOB_A, user),
      seg(shiftId, day, 'driving', '14:00', '14:20', null, user),
      seg(shiftId, day, 'job', '14:20', '15:00', JOB_B, user),
      seg(shiftId, day, 'driving', '15:00', '16:45', null, user),
      // Phone never closed the last segment; clipped at the 17:00 auto-stop.
      seg(shiftId, day, 'shop', '16:45', null, null, user),
    ],
  };
}

const MON = { ...DEFAULT_PAYROLL_SETTINGS, weekStartDow: 1 };

const NOW = Date.parse(t('2026-11-03', '12:00'));

// ── Dates ──────────────────────────────────────────────────────────────────

assert.equal(phoenixWorkDate(t('2026-10-28', '23:30')), '2026-10-28', 'late Phoenix evening stays on its day');
assert.equal(weekStartFor('2026-10-28', 1), '2026-10-26', 'Wednesday → Monday');
assert.equal(weekStartFor('2026-10-26', 1), '2026-10-26');
assert.equal(weekStartFor('2026-11-01', 1), '2026-10-26', 'Sunday ends the Mon-Sun week');
assert.equal(weekStartFor('2026-11-01', 0), '2026-11-01', 'Sunday-start week');
assert.deepEqual(payrollSettingsFromRow({ week_start_dow: 9, overtime_weekly_hours: 'x' }), DEFAULT_PAYROLL_SETTINGS);

// ── ITDG pay week (Thu-Wed) and biweekly pay period ────────────────────────

assert.equal(DEFAULT_PAYROLL_SETTINGS.weekStartDow, 4, 'default pay week starts Thursday');
assert.equal(weekStartFor('2026-10-22', 4), '2026-10-22', 'Thursday starts the week');
assert.equal(weekStartFor('2026-10-28', 4), '2026-10-22', 'Wednesday ends the Thu-Wed week');
assert.equal(weekStartFor('2026-10-29', 4), '2026-10-29');
assert.equal(weekStartFor('2026-11-04', 4), '2026-10-29');
{
  const p = payPeriodFor('2026-10-29', DEFAULT_PAYROLL_SETTINGS);
  assert.deepEqual(p, { start: '2026-10-22', end: '2026-11-04', weekStarts: ['2026-10-22', '2026-10-29'] });
  assert.equal(payPeriodFor('2026-10-22', DEFAULT_PAYROLL_SETTINGS).start, '2026-10-22', 'anchor day');
  assert.equal(payPeriodFor('2026-11-04', DEFAULT_PAYROLL_SETTINGS).start, '2026-10-22', 'last Wednesday of the period');
  assert.equal(payPeriodFor('2026-11-05', DEFAULT_PAYROLL_SETTINGS).start, '2026-11-05', 'next period');
  assert.equal(payPeriodFor('2026-11-18', DEFAULT_PAYROLL_SETTINGS).end, '2026-11-18');
  assert.equal(payPeriodFor('2026-10-21', DEFAULT_PAYROLL_SETTINGS).start, '2026-10-08', 'before the anchor');
  // US DST ended Sun Nov 1, 2026; Phoenix stays UTC-7, so the period is exactly 14 x 24 h.
  const span = Date.parse(`${p.end}T00:00:00-07:00`) - Date.parse(`${p.start}T00:00:00-07:00`);
  assert.equal(span, 13 * 86_400_000, 'no DST hour lost or gained across Nov 1');
  assert.equal(phoenixWorkDate('2026-11-01T06:59:00Z'), '2026-10-31', 'Phoenix still UTC-7 after Nov 1');
  assert.equal(phoenixWorkDate('2026-11-01T07:00:00Z'), '2026-11-01');
  const row = payrollSettingsFromRow({ week_start_dow: 4, pay_period_length_days: 14, pay_period_anchor_date: '2026-10-22' });
  assert.equal(row.payPeriodLengthDays, 14);
  assert.equal(row.payPeriodAnchorDate, '2026-10-22');
  assert.equal(payrollSettingsFromRow({ pay_period_length_days: 10 }).payPeriodLengthDays, 14, 'non-week lengths rejected');
}

// Per-week overtime inside a biweekly period: 47.5 h in week 1, 28.5 h in week 2.
{
  const shifts: PayrollShiftRow[] = [];
  const segments: PayrollSegmentRow[] = [];
  const workDays = [
    '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', // Thu Fri Mon Tue Wed
    '2026-10-29', '2026-10-30', '2026-11-02', // Thu Fri, then Mon after the DST change
  ];
  workDays.forEach((day, i) => {
    const built = fullDay(day, `bi-${i}`);
    shifts.push({ ...built.shift, end_reason: 'clock_out' });
    segments.push(...built.segments);
  });
  const { weeks, days } = buildPayroll({ shifts, segments, jobs, now: NOW });
  assert.deepEqual(weeks.map(week => [week.weekStart, week.weekEnd]), [['2026-10-22', '2026-10-28'], ['2026-10-29', '2026-11-04']]);
  assert.equal(weeks[0].paidMinutes, 5 * 570);
  assert.equal(weeks[0].overtimeMinutes, 5 * 570 - 2400, 'week 1 over 40 h');
  assert.equal(days.find(day => day.workDate === '2026-10-28')?.overtimeMinutes, 450, 'Wednesday carries week 1 overtime');
  assert.equal(weeks[1].paidMinutes, 3 * 570);
  assert.equal(weeks[1].overtime, false, 'week 2 under 40 h; no overtime carried across weeks');
  assert.equal(days.find(day => day.workDate === '2026-11-02')?.paidMinutes, 570, 'Nov 2 (after DST ends elsewhere) still 9.5 h');
  const periodPaid = weeks.reduce((sum, week) => sum + week.paidMinutes, 0);
  assert.equal(periodPaid, 8 * 570, 'period total');
}

// ── One day ────────────────────────────────────────────────────────────────

{
  const { shift, segments } = fullDay('2026-10-26', 'shift-1');
  const { days, weeks } = buildPayroll({ shifts: [shift], segments, jobs, now: NOW });
  assert.equal(days.length, 1);
  const day = days[0];
  assert.equal(day.workDate, '2026-10-26');
  assert.equal(day.shopMinutes, 45);
  assert.equal(day.travelMinutes, 30 + 20 + 105);
  assert.equal(day.onsiteMinutes, 180 + 150 + 40);
  assert.equal(day.lunchMinutes, 30);
  assert.equal(day.lunchDeductedMinutes, 30);
  assert.equal(day.paidMinutes, 570, '9.5 h = 10 h on the clock minus 30 min lunch');
  assert.equal(day.paidMinutes, 600 - day.lunchDeductedMinutes, 'paid = clock-in to clock-out minus unpaid lunch');

  const a = day.jobs.find(job => job.jobId === '101');
  const b = day.jobs.find(job => job.jobId === '202');
  const none = day.jobs.find(job => job.key === 'travel:none');
  assert.deepEqual([a?.travelMinutes, a?.onsiteMinutes, a?.pinned], [30, 330, true]);
  assert.deepEqual([b?.travelMinutes, b?.onsiteMinutes, b?.pinned], [20, 40, false]);
  assert.equal(none?.travelMinutes, 105, 'travel back to the shop has no job');
  assert.equal(day.jobs[day.jobs.length - 1].key, 'travel:none', 'no-job travel listed last');

  const kinds = day.anomalies.map(anomaly => anomaly.kind).sort();
  assert.deepEqual(kinds, ['auto_stop', 'long_travel', 'unpinned_job']);
  assert.equal(weeks[0].overtime, false);
}

// ── Paid lunch ─────────────────────────────────────────────────────────────

{
  const { shift, segments } = fullDay('2026-10-26', 'shift-paid');
  const { days } = buildPayroll({
    shifts: [shift],
    segments,
    jobs,
    settings: { ...DEFAULT_PAYROLL_SETTINGS, lunchPaid: true },
    now: NOW,
  });
  assert.equal(days[0].lunchDeductedMinutes, 0);
  assert.equal(days[0].paidMinutes, 600);
}

// ── Weekly overtime (Mon-Fri at 9.5 h = 47.5 h) ────────────────────────────

{
  const shifts: PayrollShiftRow[] = [];
  const segments: PayrollSegmentRow[] = [];
  ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'].forEach((day, i) => {
    const built = fullDay(day, `week-${i}`);
    shifts.push({ ...built.shift, end_reason: 'clock_out' });
    segments.push(...built.segments);
  });
  // Next Monday starts a new pay week.
  const next = fullDay('2026-11-02', 'week-next');
  shifts.push(next.shift);
  segments.push(...next.segments);

  const { weeks, days } = buildPayroll({ shifts, segments, jobs, settings: MON, now: NOW });
  assert.equal(weeks.length, 2);
  const first = weeks[0];
  assert.equal(first.weekStart, '2026-10-26');
  assert.equal(first.weekEnd, '2026-11-01');
  assert.equal(first.paidMinutes, 5 * 570);
  assert.equal(first.overtime, true);
  assert.equal(first.overtimeMinutes, 5 * 570 - 40 * 60);
  assert.equal(first.regularMinutes, 40 * 60);
  assert.equal(days.find(day => day.workDate === '2026-10-29')?.overtimeMinutes, 0, 'Thursday ends at 38 h');
  assert.equal(days.find(day => day.workDate === '2026-10-30')?.overtimeMinutes, 450, 'Friday carries the 7.5 h over 40');
  assert.equal(weeks[1].overtime, false);

  // Sunday-start week moves the boundary.
  const sunday = buildPayroll({ shifts, segments, jobs, settings: { ...DEFAULT_PAYROLL_SETTINGS, weekStartDow: 0 }, now: NOW });
  assert.equal(sunday.weeks[0].weekStart, '2026-10-25');
  assert.equal(sunday.weeks[1].weekStart, '2026-11-01');

  // Higher threshold: no overtime.
  const fifty = buildPayroll({ shifts, segments, jobs, settings: { ...MON, overtimeWeeklyHours: 50 }, now: NOW });
  assert.equal(fifty.weeks[0].overtime, false);
}

// ── Open shifts, clipping, edits ───────────────────────────────────────────

{
  const stale: PayrollShiftRow = { id: 'open-old', user_id: USER, started_at: t('2026-11-02', '07:00'), ended_at: null, end_reason: null };
  const live: PayrollShiftRow = { id: 'open-now', user_id: 'user-b', started_at: t('2026-11-03', '07:00'), ended_at: null, end_reason: null };
  const { days } = buildPayroll({
    shifts: [stale, live],
    segments: [
      seg('open-now', '2026-11-03', 'shop', '06:00', null, null, 'user-b'),
    ],
    jobs,
    now: NOW,
  });
  const old = days.find(day => day.userId === USER);
  const today = days.find(day => day.userId === 'user-b');
  assert.ok(old?.anomalies.some(anomaly => anomaly.kind === 'open_shift'), 'still clocked in from yesterday');
  assert.equal(today?.anomalies.length, 0, 'open shift today is normal');
  assert.equal(today?.shopMinutes, 5 * 60, 'segment clipped to clock-in and counted to now');
}

{
  const edited: PayrollShiftRow = {
    id: 'edited', user_id: USER, started_at: t('2026-10-27', '07:00'), ended_at: t('2026-10-27', '15:30'),
    end_reason: 'auto_stop', owner_edited_at: t('2026-10-28', '09:00'),
  };
  const { days } = buildPayroll({
    shifts: [edited],
    segments: [seg('edited', '2026-10-27', 'shop', '07:00', '15:30')],
    jobs,
    now: NOW,
  });
  const flag = days[0].anomalies.find(anomaly => anomaly.kind === 'auto_stop');
  assert.equal(flag?.resolved, true, 'corrected auto-stop is still listed but resolved');
  assert.equal(days[0].edited, true);
}

// ── CSV ────────────────────────────────────────────────────────────────────

{
  const { shift, segments } = fullDay('2026-10-26', 'csv-1');
  const tricky = segments.map(segment => segment.job_id === 202
    ? { ...segment, job_name: '=HYPERLINK("x")' }
    : segment);
  const { weeks } = buildPayroll({ shifts: [shift], segments: tricky, jobs: new Map([['101', jobs.get('101')!]]), now: NOW });
  const csv = payrollCsv(weeks, {
    names: { [USER]: 'Garcia, Luis' },
    approved: new Set([`${USER}|day|2026-10-26`]),
  });
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0].split(',')[0], 'Row');
  assert.ok(lines[1].startsWith('Day,"Garcia, Luis",2026-10-26,2026-10-22,'), 'comma in name is quoted');
  assert.ok(lines[1].includes(',9.50,'), 'paid hours');
  assert.ok(lines[1].includes(',yes,'), 'day approved');
  assert.ok(lines.some(line => line.startsWith('Job,') && line.includes('Congress Site') && line.includes(',5.50,')));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'formula-looking job name is neutralized');
  assert.ok(lines[lines.length - 1].startsWith('Week,'), 'week total row last');
  assert.ok(lines[lines.length - 1].includes(',no,'), 'week not approved');
}

// ── Daily summary ──────────────────────────────────────────────────────────

{
  const one = fullDay('2026-10-26', 'sum-1');
  const two = fullDay('2026-10-26', 'sum-2', 'user-b');
  const { days } = buildPayroll({ shifts: [one.shift, two.shift], segments: [...one.segments, ...two.segments], jobs, now: NOW });
  const text = dailySummaryText('2026-10-26', days, { [USER]: 'Luis', 'user-b': 'Ana' });
  const lines = text.split('\n');
  assert.equal(lines[0], 'Payroll 2026-10-26: 19.00h total');
  assert.match(lines[1], /^Ana: 9\.50h paid \(travel 2\.58h\), 3 flags$/);
  assert.equal(dailySummaryText('2026-10-27', days, {}), 'Payroll 2026-10-27: no shifts recorded.');
}

console.log('payroll checks passed');
