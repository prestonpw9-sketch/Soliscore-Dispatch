/**
 * Late / off-site clock-in: never blocked by location, Start now vs. I started
 * earlier, bounds on the claimed start, flags, gap backfill with and without
 * saved location points, and how payroll shows it.
 * Does not call Supabase or the network.
 *
 * Run: npm run test:late-clockin
 */
import assert from 'node:assert/strict';
import { DEFAULT_WORK_HOURS } from '../src/lib/geofence/workHours.ts';
import {
  DEFAULT_LATE_START,
  LATE_START_UNCONFIRMED,
  checkClaimedStart,
  claimedStartFromClock,
  clockInNote,
  isLateStart,
  lateStartFromSettingsRow,
  startNeedsPrompt,
} from '../src/lib/shift/lateStart.ts';
import { DEFAULT_LUNCH } from '../src/lib/shift/lunch.ts';
import { initialMachine, openSegment, step } from '../src/lib/shift/machine.ts';
import { clockInFromRow, reconcile } from '../src/lib/shift/reconcile.ts';
import { rowsFromTransition } from '../src/lib/shift/rows.ts';
import {
  DEFAULT_DWELL_MS,
  DEFAULT_SPEED_SUSTAIN_MS,
  MPH_TO_MPS,
  type ClockInOptions,
  type Fix,
  type MachineState,
  type TrackingConfig,
} from '../src/lib/shift/types.ts';
import {
  buildPayroll,
  payrollCsv,
  PAYROLL_CSV_HEADER,
  clockOutCheckFlags,
  payrollSettingsFromRow,
  receivedCheckFlags,
  RECEIVED_GRACE_MINUTES,
  type PayrollSegmentRow,
  type PayrollShiftRow,
} from '../supabase/functions/_shared/payroll.ts';

const SHOP = { latitude: 32.22, longitude: -110.97 };
const NORTH = (meters: number) => SHOP.latitude + meters / 111_320;
const JOB = { latitude: NORTH(8_000), longitude: SHOP.longitude };
// Somewhere on the way to Mesa: far from the shop and every fence.
const HIGHWAY = { latitude: NORTH(40_000), longitude: SHOP.longitude };
const DAY = '2026-11-02'; // Monday, Phoenix (UTC-7 all year)

function at(hhmm: string, day = DAY): number {
  return Date.parse(`${day}T${hhmm}:00-07:00`);
}

function idsFrom(start = 1): () => string {
  let n = start;
  return () => `id-${n++}`;
}

function config(overrides: Partial<TrackingConfig> = {}): TrackingConfig {
  return {
    shop: { id: 'shop-1', name: 'Shop', ...SHOP, radiusMeters: 90 },
    sites: [{ id: '101', name: 'Congress Site', ...JOB, radiusMeters: 90 }],
    speedMph: 10,
    speedSustainMs: DEFAULT_SPEED_SUSTAIN_MS,
    dwellMs: DEFAULT_DWELL_MS,
    batteryEveryMs: 15 * 60_000,
    safety: { ...DEFAULT_WORK_HOURS },
    lunch: { ...DEFAULT_LUNCH },
    lateStart: { ...DEFAULT_LATE_START },
    ...overrides,
  };
}

function fix(atMs: number, where: { latitude: number; longitude: number }, mph: number | null = 0, accuracyM = 10): Fix {
  return {
    at: atMs,
    latitude: where.latitude,
    longitude: where.longitude,
    speedMps: mph == null ? null : mph * MPH_TO_MPS,
    batteryPercent: 80,
    accuracyM,
  };
}

function clockIn(state: MachineState, tap: Fix, options?: ClockInOptions, cfg = config(), ids = idsFrom()) {
  return step(state, { type: 'clock-in', fix: tap, options }, cfg, ids);
}

function kinds(state: MachineState): string {
  return state.segments.map(segment => segment.kind).join(',');
}

// ── Pure rules ─────────────────────────────────────────────────────────────

{
  assert.equal(claimedStartFromClock('06:15', at('07:42')), at('06:15'));
  assert.equal(claimedStartFromClock('25:00', at('07:42')), null);
  assert.equal(claimedStartFromClock('nope', at('07:42')), null);

  assert.equal(isLateStart(at('06:05'), DEFAULT_LATE_START), false, 'inside the 5 minute grace');
  assert.equal(isLateStart(at('06:06'), DEFAULT_LATE_START), true);
  assert.equal(isLateStart(at('05:50'), DEFAULT_LATE_START), false);

  // Preston: a late start at the shop also asks Start now / I started earlier.
  assert.equal(startNeedsPrompt({ atShop: true, late: false }), false, 'on time at the shop starts right away');
  assert.equal(startNeedsPrompt({ atShop: true, late: isLateStart(at('06:20'), DEFAULT_LATE_START) }), true, 'late at the shop asks');
  assert.equal(startNeedsPrompt({ atShop: false, late: false }), true, 'away from the shop asks');
  assert.equal(startNeedsPrompt({ atShop: false, late: true }), true);

  const tap = at('07:42');
  const ok = checkClaimedStart(at('06:00'), tap, DEFAULT_LATE_START);
  assert.deepEqual(ok, { ok: true, startAt: at('06:00'), backdated: true });
  const same = checkClaimedStart(tap - 30_000, tap, DEFAULT_LATE_START);
  assert.equal(same.ok && same.backdated, false, 'a start within a minute of the tap is just now');

  const future = checkClaimedStart(at('08:00'), tap, DEFAULT_LATE_START);
  assert.equal(future.ok === false && future.problem, 'future');
  const early = checkClaimedStart(at('03:59'), tap, DEFAULT_LATE_START);
  assert.equal(early.ok === false && early.problem, 'too-early');
  assert.match(early.ok === false ? early.message : '', /4:00 AM/);
  const atFour = checkClaimedStart(at('04:00'), tap, DEFAULT_LATE_START);
  assert.equal(atFour.ok, true, '4:00 AM itself is allowed');
  const yesterday = checkClaimedStart(at('16:00', '2026-11-01'), tap, DEFAULT_LATE_START);
  assert.equal(yesterday.ok === false && yesterday.problem, 'other-day');
  const overlap = checkClaimedStart(at('06:00'), tap, DEFAULT_LATE_START, at('06:30'));
  assert.equal(overlap.ok === false && overlap.problem, 'overlaps');
  const invalid = checkClaimedStart(NaN, tap, DEFAULT_LATE_START);
  assert.equal(invalid.ok === false && invalid.problem, 'invalid');

  assert.equal(lateStartFromSettingsRow({ lunch_start: '11:00' }).ready, false, 'old settings row: not ready');
  const ready = lateStartFromSettingsRow({ normal_start_time: '06:30:00', late_grace_minutes: 10, backdate_earliest_time: '04:00:00' });
  assert.deepEqual(
    [ready.ready, ready.normalStartMinute, ready.lateGraceMinutes, ready.earliestMinute],
    [true, 390, 10, 240],
  );

  const note = clockInNote({
    flags: ['late_clock_in', 'backdated', 'off_site_start'],
    startAt: at('06:00'),
    tapAt: at('07:42'),
    distanceFromShopM: 40_000,
    reason: '  forgot   at the shop ',
    historyPoints: 0,
  });
  assert.match(note, /25 mi from the shop/);
  assert.match(note, /6:00 AM; tapped Start at 7:42 AM/);
  assert.match(note, /No location history for the gap; marked unverified/);
  assert.match(note, /Reason: forgot at the shop$/);
}

// ── Off-site start: never blocked ──────────────────────────────────────────

{
  const tap = fix(at('07:42'), HIGHWAY, 65);
  const result = clockIn(initialMachine(), tap);
  assert.equal(result.error, null, 'away from the shop still starts');
  assert.equal(result.offSite, true);
  assert.ok((result.distanceM ?? 0) > 39_000);
  assert.deepEqual(result.flags, ['late_clock_in', 'off_site_start']);
  const shift = result.state.shift!;
  assert.equal(shift.startedAt, new Date(at('07:42')).toISOString(), 'Start now = the tap time');
  assert.equal(shift.clockIn?.tappedAt, shift.startedAt);
  assert.equal(kinds(result.state), 'driving', 'moving and outside every fence: Travel');
  assert.equal(result.state.batterySamples.length, 1);

  const rows = rowsFromTransition('user-1', initialMachine(), result.state);
  const shiftRow = rows.find(row => row.table === 'shifts')!;
  assert.deepEqual(shiftRow.record.clock_in_flags, ['late_clock_in', 'off_site_start']);
  assert.equal(shiftRow.record.clock_in_tapped_at, shift.startedAt);
  assert.match(String(shiftRow.record.clock_in_note), /mi from the shop/);
}

{
  // On time, at the shop, no job: exactly the old row shape (no new columns).
  const result = clockIn(initialMachine(), fix(at('05:55'), SHOP));
  assert.equal(result.error, null);
  assert.equal(result.offSite, false);
  assert.deepEqual(result.flags, []);
  assert.equal(result.state.shift?.clockIn, null);
  assert.equal(kinds(result.state), 'shop');
  const shiftRow = rowsFromTransition('user-1', initialMachine(), result.state).find(row => row.table === 'shifts')!;
  assert.equal('clock_in_flags' in shiftRow.record, false, 'normal start sends no late clock-in columns');
}

{
  // Server without the migration: off-site Start now still works, writes no
  // flag columns (so the outbox cannot stall), and backdating is refused.
  const cfg = config({ lateStart: { ...LATE_START_UNCONFIRMED } });
  const result = clockIn(initialMachine(), fix(at('07:42'), HIGHWAY, 0), undefined, cfg);
  assert.equal(result.error, null);
  assert.equal(result.offSite, true);
  assert.equal(result.state.shift?.clockIn, null);
  const shiftRow = rowsFromTransition('user-1', initialMachine(), result.state).find(row => row.table === 'shifts')!;
  assert.equal('clock_in_flags' in shiftRow.record, false);

  const back = clockIn(initialMachine(), fix(at('07:42'), HIGHWAY), { claimedStartAt: at('06:00') }, cfg);
  assert.equal(back.error, 'late-start-unavailable');
  assert.equal(back.state.shift, null);
  // No config at all behaves the same (older callers).
  const { lateStart: _unused, ...legacy } = config();
  void _unused;
  assert.equal(clockIn(initialMachine(), fix(at('07:42'), HIGHWAY), undefined, legacy).error, null);
}

// ── Picked job at clock-in ─────────────────────────────────────────────────

{
  // Inside the picked job's fence: the first row is that job.
  const onJob = clockIn(initialMachine(), fix(at('07:00'), JOB), { jobId: '101', jobName: 'Congress Site' });
  assert.equal(openSegment(onJob.state)?.kind, 'job');
  assert.equal(openSegment(onJob.state)?.jobId, '101');
  assert.equal(onJob.state.shift?.clockIn?.startJobId, '101');

  // Driving toward it: Travel that carries the destination.
  const driving = clockIn(initialMachine(), fix(at('07:00'), HIGHWAY, 60), { jobId: '101', jobName: 'Congress Site' });
  const travel = openSegment(driving.state)!;
  assert.equal(travel.kind, 'driving');
  assert.equal(travel.jobId, '101');
  assert.equal(travel.jobName, 'Congress Site');

  // A picked job with no pin, phone not moving: on that job, and it stays on
  // it while the phone sits there (no flip to Travel after two minutes).
  const unpinned = clockIn(initialMachine(), fix(at('07:00'), HIGHWAY, 0), { jobId: '555', jobName: 'Mesa Remodel' });
  assert.equal(openSegment(unpinned.state)?.kind, 'job');
  assert.equal(openSegment(unpinned.state)?.jobId, '555');
  let s = unpinned.state;
  for (let minute = 1; minute <= 10; minute += 1) {
    s = step(s, { type: 'sample', fix: fix(at('07:00') + minute * 60_000, { latitude: HIGHWAY.latitude + 0.0002, longitude: HIGHWAY.longitude }, 0) }, config(), idsFrom(100 + minute)).state;
  }
  assert.equal(kinds(s), 'job', 'parked at an unpinned job stays on the job');

  const segmentRow = rowsFromTransition('user-1', initialMachine(), driving.state).find(row => row.table === 'time_segments')!;
  assert.equal(segmentRow.record.job_id, 101);
}

// ── Backdated start, no saved locations ────────────────────────────────────

{
  const tap = fix(at('07:42'), HIGHWAY, 65);
  const result = clockIn(initialMachine(), tap, { claimedStartAt: at('06:00'), reason: 'Forgot at the shop' });
  assert.equal(result.error, null);
  assert.equal(result.historyPoints, 0);
  assert.deepEqual(result.flags, ['late_clock_in', 'backdated', 'off_site_start']);
  const shift = result.state.shift!;
  assert.equal(shift.startedAt, new Date(at('06:00')).toISOString(), 'clock-in is the claimed start');
  assert.equal(shift.clockIn?.tappedAt, new Date(at('07:42')).toISOString(), 'tap time recorded too');
  assert.match(shift.clockIn?.note ?? '', /No location history/);
  assert.match(shift.clockIn?.note ?? '', /Reason: Forgot at the shop/);

  const [gap, live] = result.state.segments;
  assert.equal(result.state.segments.length, 2);
  assert.equal(gap.kind, 'unverified', 'nothing invented: one unverified block');
  assert.equal(gap.startedAt, new Date(at('06:00')).toISOString());
  assert.equal(gap.endedAt, new Date(at('07:42')).toISOString());
  assert.equal(gap.startLatitude, null);
  assert.equal(gap.backfilled, undefined);
  assert.equal(live.kind, 'driving');
  assert.equal(live.startedAt, new Date(at('07:42')).toISOString());

  // Native samples queued before the tap must not rewrite the gap.
  const stale = step(result.state, { type: 'sample', fix: fix(at('07:00'), SHOP) }, config(), idsFrom(900));
  assert.equal(stale.state, result.state, 'sample from before the tap is ignored');

  // The safety stop counts from the tap, not the 6:00 claimed start.
  const later = step(result.state, { type: 'sample', fix: fix(at('16:30'), HIGHWAY, 0) }, config(), idsFrom(950));
  assert.equal(later.state.shift?.endedAt, null, 'still open at 4:30 PM');

  const rows = rowsFromTransition('user-1', initialMachine(), result.state);
  const segmentKinds = rows.filter(row => row.table === 'time_segments').map(row => row.record.kind);
  assert.deepEqual(segmentKinds, ['unverified', 'driving']);
}

{
  // Bad claimed start: refused with a message, nothing started.
  const tap = fix(at('07:42'), HIGHWAY);
  for (const claimed of [at('03:30'), at('08:30'), at('16:00', '2026-11-01')]) {
    const result = clockIn(initialMachine(), tap, { claimedStartAt: claimed });
    assert.equal(result.error, 'bad-start-time');
    assert.ok(result.message);
    assert.equal(result.state.shift, null);
  }
  // Not before an earlier shift's clock-out the same day.
  let ended = clockIn(initialMachine(), fix(at('05:50'), SHOP), undefined, config(), idsFrom(1_000)).state;
  ended = step(ended, { type: 'clock-out', fix: fix(at('06:30'), SHOP) }, config(), idsFrom(1_010)).state;
  const overlap = clockIn(ended, tap, { claimedStartAt: at('06:15') });
  assert.equal(overlap.error, 'bad-start-time');
  assert.match(overlap.message ?? '', /clocked out at 6:30 AM/);
  assert.equal(clockIn(ended, tap, { claimedStartAt: at('06:45') }).error, null);
}

{
  // Lunch inside the gap still comes out (11:00-11:30).
  const result = clockIn(initialMachine(), fix(at('12:10'), SHOP), { claimedStartAt: at('10:00') });
  assert.equal(result.error, null);
  assert.equal(kinds(result.state), 'unverified,lunch,unverified,shop');
  const lunch = result.state.segments[1];
  assert.equal(lunch.startedAt, new Date(at('11:00')).toISOString());
  assert.equal(lunch.endedAt, new Date(at('11:30')).toISOString());
  assert.equal(result.state.segments[2].endedAt, new Date(at('12:10')).toISOString());
}

// ── Backdated start with saved locations ──────────────────────────────────

{
  // 6:00 at the shop, 6:20 driving north, arrive at the job 6:40, sit there,
  // tap Start at 7:42 on the job.
  const history: Fix[] = [fix(at('06:00'), SHOP, 0), fix(at('06:10'), SHOP, 0)];
  for (let minute = 20; minute <= 34; minute += 2) {
    const progress = (minute - 20) / 14;
    history.push(fix(at(`06:${String(minute).padStart(2, '0')}`), {
      latitude: NORTH(300 + progress * 7_600),
      longitude: SHOP.longitude,
    }, 35));
  }
  for (let minute = 40; minute <= 58; minute += 2) {
    history.push(fix(at(`06:${String(minute).padStart(2, '0')}`), JOB, 0));
  }
  const result = clockIn(initialMachine(), fix(at('07:42'), JOB), { claimedStartAt: at('06:00'), history });
  assert.equal(result.error, null);
  assert.equal(result.historyPoints, history.length);
  assert.equal(kinds(result.state), 'shop,driving,job,job', 'shop, travel, and on-site rebuilt from the points');
  const [shop, drive, job, live] = result.state.segments;
  assert.equal(shop.startedAt, new Date(at('06:00')).toISOString(), 'point right at the claimed start: no unverified sliver');
  assert.ok(shop.backfilled && drive.backfilled && job.backfilled, 'gap rows are marked backfilled');
  assert.equal(job.jobId, '101');
  assert.ok(Date.parse(drive.startedAt) >= at('06:10') && Date.parse(drive.startedAt) <= at('06:22'));
  assert.equal(live.backfilled, undefined, 'the row from the tap on is live');
  assert.equal(live.startedAt, new Date(at('07:42')).toISOString());
  assert.match(result.state.shift?.clockIn?.note ?? '', /Gap filled from \d+ saved location points/);
  const backfilledRow = rowsFromTransition('user-1', initialMachine(), result.state)
    .find(row => row.table === 'time_segments' && row.record.kind === 'shop')!;
  assert.equal(backfilledRow.record.backfilled, true);
}

{
  // Time before the first point is unverified; shop time needs a point
  // inside the shop fence (parked 150 m away, still, is not shop).
  const nearShop = { latitude: NORTH(200), longitude: SHOP.longitude };
  const history = [0, 5, 10, 15, 20].map(minute => fix(at('06:30') + minute * 60_000, nearShop, 0));
  const result = clockIn(initialMachine(), fix(at('07:42'), HIGHWAY, 60), { claimedStartAt: at('06:00'), history });
  assert.equal(result.error, null);
  assert.equal(kinds(result.state), 'unverified,driving,driving');
  assert.equal(result.state.segments[0].endedAt, new Date(at('06:30')).toISOString());
  assert.ok(!result.state.segments.some(segment => segment.kind === 'shop'), 'no shop time without a point inside the fence');

  // Points outside the gap are not used.
  const outside = clockIn(initialMachine(), fix(at('07:42'), HIGHWAY), {
    claimedStartAt: at('06:00'),
    history: [fix(at('05:30'), SHOP), fix(at('07:50'), SHOP)],
  });
  assert.equal(outside.historyPoints, 0);
  assert.equal(kinds(outside.state), 'unverified,driving');
}

// ── No location at all ─────────────────────────────────────────────────────

{
  const tap: Fix = { at: at('06:30'), latitude: NaN, longitude: NaN, speedMps: null, batteryPercent: 70, accuracyM: null };
  const result = clockIn(initialMachine(), tap, { noFix: true });
  assert.equal(result.error, null, 'no GPS still clocks in');
  assert.deepEqual(result.flags, ['late_clock_in', 'no_location']);
  assert.equal(result.state.shift?.startLatitude, null);
  assert.equal(kinds(result.state), 'unverified');
  assert.equal(result.state.lastSample, null);
  // The first real fix places the phone.
  const placed = step(result.state, { type: 'sample', fix: fix(at('06:40'), SHOP) }, config(), idsFrom(700));
  assert.equal(kinds(placed.state), 'unverified,shop');
  // Not offered before the server is ready.
  assert.equal(clockIn(initialMachine(), tap, { noFix: true }, config({ lateStart: { ...LATE_START_UNCONFIRMED } })).error, 'late-start-unavailable');
}

// ── Server resume keeps the flags ──────────────────────────────────────────

{
  const row = {
    id: 'shift-r',
    started_at: '2026-11-02T13:00:00+00:00',
    ended_at: null,
    end_reason: null,
    clock_in_tapped_at: '2026-11-02T14:42:00+00:00',
    clock_in_flags: ['backdated', 'bogus'],
    clock_in_note: 'note',
    start_job_id: 101,
  };
  assert.deepEqual(clockInFromRow(row), {
    tappedAt: '2026-11-02T14:42:00.000Z',
    flags: ['backdated'],
    note: 'note',
    startJobId: '101',
  });
  assert.equal(clockInFromRow({ id: 'x', started_at: row.started_at, ended_at: null, end_reason: null }), null);
  const resumed = reconcile(initialMachine(), { localShiftRow: null, openShift: row, openSegments: [] }, at('08:00'));
  assert.equal(resumed?.shift?.clockIn?.tappedAt, '2026-11-02T14:42:00.000Z');
  assert.equal(resumed?.shift?.startLatitude, null);
}

// ── Payroll: flag display, unverified time, travel to the picked job ───────

{
  const shift: PayrollShiftRow = {
    id: 'late-1',
    user_id: 'preston',
    started_at: new Date(at('06:00')).toISOString(),
    ended_at: new Date(at('15:00')).toISOString(),
    end_reason: 'clock_out',
    clock_in_tapped_at: new Date(at('07:42')).toISOString(),
    clock_in_flags: ['late_clock_in', 'backdated', 'off_site_start'],
    clock_in_note: 'Started 25 mi from the shop.',
    start_job_id: 101,
  };
  const seg = (id: string, kind: PayrollSegmentRow['kind'], from: string, to: string, jobId: number | null = null, jobName: string | null = null): PayrollSegmentRow => ({
    id,
    shift_id: 'late-1',
    user_id: 'preston',
    kind,
    job_id: jobId,
    job_name: jobName,
    started_at: new Date(at(from)).toISOString(),
    ended_at: new Date(at(to)).toISOString(),
  });
  const segments = [
    seg('u', 'unverified', '06:00', '07:42', null, 'Unverified'),
    seg('d', 'driving', '07:42', '09:00', 101, 'Mesa Remodel'),
    seg('j', 'job', '09:00', '15:00', 101, 'Mesa Remodel'),
  ];
  const { days, weeks } = buildPayroll({ shifts: [shift], segments, now: at('18:00') });
  const day = days[0];
  assert.equal(day.unverifiedMinutes, 102);
  assert.equal(day.lunchMinutes, 30, 'company lunch still carved out');
  assert.equal(day.paidMinutes, 9 * 60 - 30, 'unverified time is paid (no approval), lunch deducted');
  const flag = day.anomalies.find(anomaly => anomaly.kind === 'late_clock_in');
  assert.ok(flag && !flag.resolved);
  assert.match(flag!.message, /^Late clock-in, backdated start, started away from shop; clock-in 6:00 AM, tapped Start 7:42 AM — Started 25 mi/);
  const unverified = day.anomalies.find(anomaly => anomaly.kind === 'unverified_time');
  assert.match(unverified?.message ?? '', /Unverified 1\.70 h 6:00 AM–7:42 AM/);
  assert.deepEqual(day.shifts[0].clockInFlags, ['late_clock_in', 'backdated', 'off_site_start']);
  assert.equal(day.shifts[0].startJobId, '101');
  const mesa = day.jobs.find(job => job.key === 'job:101');
  assert.equal(mesa?.travelMinutes, 78, 'travel counts toward the job driven to');

  const reviewed = buildPayroll({
    shifts: [{ ...shift, clock_in_reviewed_at: new Date(at('17:00')).toISOString() }],
    segments: [{ ...segments[0], owner_edited_at: new Date(at('17:00')).toISOString() }, ...segments.slice(1)],
    now: at('18:00'),
  }).days[0];
  assert.ok(reviewed.anomalies.filter(anomaly => anomaly.kind === 'late_clock_in' || anomaly.kind === 'unverified_time').every(anomaly => anomaly.resolved));
  assert.match(reviewed.anomalies.find(anomaly => anomaly.kind === 'late_clock_in')!.message, /\(reviewed\)$/);

  // Travel with a destination still loses to an actual next job stop.
  const elsewhere = buildPayroll({
    shifts: [shift],
    segments: [segments[0], segments[1], seg('j2', 'job', '09:00', '15:00', 202, 'Other')],
    now: at('18:00'),
  }).days[0];
  assert.equal(elsewhere.jobs.find(job => job.key === 'job:202')?.travelMinutes, 78);

  const csv = payrollCsv(weeks, { names: { preston: 'Preston' } });
  const [header, dayLine] = csv.trim().split('\r\n');
  assert.equal(header.split(',').at(-1), 'Unverified hrs');
  assert.equal(PAYROLL_CSV_HEADER.indexOf('Paid hrs'), 12, 'existing columns did not move');
  assert.match(dayLine, /1\.70$/);

  // A normal shift has no clock-in flag.
  const normal = buildPayroll({
    shifts: [{ id: 'n', user_id: 'greg', started_at: new Date(at('06:00')).toISOString(), ended_at: new Date(at('07:00')).toISOString(), end_reason: 'clock_out' }],
    segments: [],
    now: at('18:00'),
  }).days[0];
  assert.deepEqual(normal.shifts[0].clockInFlags, []);
  assert.equal(normal.anomalies.length, 0);
}

// ── Server receive-time check ──────────────────────────────────────────────
// shifts.clock_in_received_at is stamped by the database trigger on the first
// insert; the phone can't set it. Payroll compares it with the tap time.

{
  const iso = (hhmm: string) => new Date(at(hhmm)).toISOString();
  const base: PayrollShiftRow = {
    id: 'r-1',
    user_id: 'greg',
    started_at: iso('06:00'),
    ended_at: iso('15:00'),
    end_reason: 'clock_out',
  };

  assert.deepEqual(receivedCheckFlags(base), [], 'no receive time (shift from before the migration): no check');
  assert.deepEqual(receivedCheckFlags({ ...base, clock_in_received_at: iso('06:00') }), [], 'online clock-in');
  assert.equal(RECEIVED_GRACE_MINUTES, 45, 'grace is a fixed 45 minutes');
  assert.deepEqual(receivedCheckFlags({ ...base, clock_in_received_at: iso('06:16') }), [], 'synced 16 min later: within grace');
  assert.deepEqual(receivedCheckFlags({ ...base, clock_in_received_at: iso('06:45') }), [], 'exactly 45 min: within grace');
  assert.deepEqual(receivedCheckFlags({ ...base, clock_in_received_at: iso('06:46') }), ['received_late'], 'synced 46 min later');
  assert.deepEqual(receivedCheckFlags({ ...base, clock_in_received_at: iso('05:58') }), [], 'phone up to 2 min fast is fine');
  assert.deepEqual(receivedCheckFlags({ ...base, clock_in_received_at: iso('05:50') }), ['phone_clock_ahead'], 'phone clock 10 min fast');
  // Backdated start: compare the tap, not the claimed start (already flagged backdated).
  assert.deepEqual(
    receivedCheckFlags({ ...base, clock_in_tapped_at: iso('07:42'), clock_in_received_at: iso('07:42') }),
    [],
    'backdated start sent right away is not "received late"',
  );
  // A modified phone that omits the tap time and sends an earlier start.
  assert.deepEqual(
    receivedCheckFlags({ ...base, started_at: iso('05:00'), clock_in_received_at: iso('07:42') }),
    ['received_late'],
    'start time far before the server got it is caught',
  );

  const lateSync = buildPayroll({
    shifts: [{ ...base, clock_in_received_at: iso('06:50') }],
    segments: [{
      id: 'r-seg',
      shift_id: 'r-1',
      user_id: 'greg',
      kind: 'shop',
      job_id: null,
      job_name: null,
      started_at: iso('06:00'),
      ended_at: iso('15:00'),
    }],
    now: at('18:00'),
  }).days[0];
  assert.deepEqual(lateSync.shifts[0].clockInFlags, ['received_late']);
  assert.equal(lateSync.shifts[0].receivedAt, iso('06:50'));
  const anomaly = lateSync.anomalies.find(row => row.kind === 'late_clock_in');
  assert.ok(anomaly && !anomaly.resolved, 'flagged for review');
  assert.match(anomaly!.message, /^Server got the clock-in late; clock-in 6:00 AM; server received 6:50 AM$/);
  assert.equal(lateSync.paidMinutes, 9 * 60 - 30, 'pay is unchanged: the check only flags');

  const both = buildPayroll({
    shifts: [{
      ...base,
      clock_in_tapped_at: iso('07:42'),
      clock_in_flags: ['backdated'],
      clock_in_received_at: iso('08:30'),
    }],
    segments: [],
    now: at('18:00'),
  }).days[0];
  assert.deepEqual(both.shifts[0].clockInFlags, ['backdated', 'received_late'], 'phone flags first, then the server check');
  assert.match(both.anomalies.find(row => row.kind === 'late_clock_in')!.message, /tapped Start 7:42 AM; server received 8:30 AM/);

  const reviewedSync = buildPayroll({
    shifts: [{ ...base, clock_in_received_at: iso('06:50'), clock_in_reviewed_at: iso('16:00') }],
    segments: [],
    now: at('18:00'),
  }).days[0];
  assert.equal(reviewedSync.anomalies.find(row => row.kind === 'late_clock_in')?.resolved, true, 'review (or a clock-time edit) resolves it');

  // Not a setting any more: an old settings row with a grace value is ignored.
  const oldSetting = buildPayroll({
    shifts: [{ ...base, clock_in_received_at: iso('06:10') }],
    segments: [],
    settings: payrollSettingsFromRow({ clock_in_received_grace_minutes: 5 }),
    now: at('18:00'),
  }).days[0];
  assert.deepEqual(oldSetting.shifts[0].clockInFlags, [], 'payroll_settings has no say in the grace');
  assert.equal('clockInReceivedGraceMinutes' in payrollSettingsFromRow({}), false);

  // Phone clock ahead: flagged, never rewritten. Clock-in stays the phone's time.
  const ahead = buildPayroll({
    shifts: [{
      ...base,
      started_at: iso('06:20'),
      ended_at: iso('15:00'),
      clock_in_received_at: iso('06:00'),
    }],
    segments: [{
      id: 'a-seg',
      shift_id: 'r-1',
      user_id: 'greg',
      kind: 'shop',
      job_id: null,
      job_name: null,
      started_at: iso('06:20'),
      ended_at: iso('15:00'),
    }],
    now: at('18:00'),
  }).days[0];
  assert.deepEqual(ahead.shifts[0].clockInFlags, ['phone_clock_ahead']);
  assert.equal(ahead.shifts[0].clockIn, iso('06:20'), 'start not moved to the server receive time');
  assert.equal(ahead.paidMinutes, 8 * 60 + 40 - 30, 'pay from the phone time');
  assert.match(ahead.anomalies.find(row => row.kind === 'late_clock_in')!.message, /^Phone clock ahead of server; clock-in 6:20 AM; server received 6:00 AM$/);
}

// ── Server receive-time check: clock-out ───────────────────────────────────
// shifts.clock_out_received_at is stamped by the trigger the first time a
// phone sends ended_at. Same 45-minute grace; flag only.

{
  const iso = (hhmm: string) => new Date(at(hhmm)).toISOString();
  const base: PayrollShiftRow = {
    id: 'o-1',
    user_id: 'greg',
    started_at: iso('06:00'),
    ended_at: iso('15:00'),
    end_reason: 'clock_out',
  };

  assert.deepEqual(clockOutCheckFlags(base), [], 'no receive time (old shift or set by an admin): no check');
  assert.deepEqual(clockOutCheckFlags({ ...base, clock_out_received_at: iso('15:00') }), [], 'online clock-out');
  assert.deepEqual(clockOutCheckFlags({ ...base, clock_out_received_at: iso('15:45') }), [], 'exactly 45 min: within grace');
  assert.deepEqual(clockOutCheckFlags({ ...base, clock_out_received_at: iso('15:46') }), ['clock_out_received_late'], 'synced 46 min later');
  assert.deepEqual(clockOutCheckFlags({ ...base, clock_out_received_at: iso('14:58') }), [], 'phone up to 2 min fast is fine');
  assert.deepEqual(clockOutCheckFlags({ ...base, clock_out_received_at: iso('14:50') }), ['clock_out_phone_clock_ahead'], 'phone clock 10 min fast');
  assert.deepEqual(
    clockOutCheckFlags({ ...base, ended_at: null, end_reason: null, clock_out_received_at: iso('15:00') }),
    [],
    'open shift: nothing to check',
  );
  // Auto-stop ends at the safety-stop time, noticed at the next sample: late is expected.
  assert.deepEqual(
    clockOutCheckFlags({ ...base, end_reason: 'auto_stop', clock_out_received_at: iso('18:00') }),
    [],
    'auto-stop is not "received late"',
  );
  assert.deepEqual(
    clockOutCheckFlags({ ...base, end_reason: 'auto_stop', clock_out_received_at: iso('14:00') }),
    ['clock_out_phone_clock_ahead'],
    'auto-stop is still checked for a fast phone clock',
  );

  const segments: PayrollSegmentRow[] = [{
    id: 'o-seg',
    shift_id: 'o-1',
    user_id: 'greg',
    kind: 'shop',
    job_id: null,
    job_name: null,
    started_at: iso('06:00'),
    ended_at: iso('15:00'),
  }];
  const lateOut = buildPayroll({
    shifts: [{ ...base, clock_in_received_at: iso('06:00'), clock_out_received_at: iso('17:10') }],
    segments,
    now: at('18:00'),
  }).days[0];
  assert.deepEqual(lateOut.shifts[0].clockInFlags, [], 'clock-in itself was fine');
  assert.deepEqual(lateOut.shifts[0].clockOutFlags, ['clock_out_received_late']);
  assert.equal(lateOut.shifts[0].clockOutReceivedAt, iso('17:10'));
  assert.equal(lateOut.shifts[0].clockOut, iso('15:00'), 'clock-out not moved');
  assert.equal(lateOut.paidMinutes, 9 * 60 - 30, 'pay is unchanged: the check only flags');
  assert.equal(lateOut.anomalies.some(row => row.kind === 'late_clock_in'), false);
  const outAnomaly = lateOut.anomalies.find(row => row.kind === 'late_clock_out');
  assert.ok(outAnomaly && !outAnomaly.resolved, 'flagged for review');
  assert.match(outAnomaly!.message, /^Server got the clock-out late; clock-out 3:00 PM; server received 5:10 PM$/);

  const aheadOut = buildPayroll({
    shifts: [{ ...base, ended_at: iso('15:30'), clock_out_received_at: iso('15:00') }],
    segments,
    now: at('18:00'),
  }).days[0];
  assert.deepEqual(aheadOut.shifts[0].clockOutFlags, ['clock_out_phone_clock_ahead']);
  assert.equal(aheadOut.shifts[0].clockOut, iso('15:30'), 'clock-out not rewritten to the receive time');
  assert.match(aheadOut.anomalies.find(row => row.kind === 'late_clock_out')!.message, /^Phone clock ahead of server at clock-out; clock-out 3:30 PM; server received 3:00 PM$/);

  const reviewedOut = buildPayroll({
    shifts: [{ ...base, clock_out_received_at: iso('17:10'), clock_in_reviewed_at: iso('17:30') }],
    segments,
    now: at('18:00'),
  }).days[0];
  const resolved = reviewedOut.anomalies.find(row => row.kind === 'late_clock_out');
  assert.equal(resolved?.resolved, true, 'a review or a clock-time save resolves it');
  assert.match(resolved!.message, /\(reviewed\)$/);
}

console.log('late clock-in checks passed');
