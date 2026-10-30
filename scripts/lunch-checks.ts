/**
 * Automatic unpaid lunch inside the shift state machine.
 * Does not call Supabase or the network.
 *
 * Run: npm run test:shift
 */
import assert from 'node:assert/strict';
import { DEFAULT_WORK_HOURS } from '../src/lib/geofence/workHours.ts';
import {
  DEFAULT_LUNCH,
  LUNCH_UNCONFIRMED,
  lunchFromSettingsRow,
  lunchWindowOn,
  lunchWindowsBetween,
  parseClockMinutes,
  sanitizeLunch,
  type LunchConfig,
} from '../src/lib/shift/lunch.ts';
import { initialMachine, openSegment, segmentMinutes, step } from '../src/lib/shift/machine.ts';
import { rowsFromTransition } from '../src/lib/shift/rows.ts';
import {
  DEFAULT_DWELL_MS,
  DEFAULT_SPEED_SUSTAIN_MS,
  MPH_TO_MPS,
  type Fix,
  type MachineState,
  type TrackingConfig,
} from '../src/lib/shift/types.ts';

const SHOP = { latitude: 32.22, longitude: -110.97 };
const JOB = { latitude: 32.22 + (8_000 / 111_320), longitude: -110.97 };
const JOB_B = { latitude: 32.22 - (8_000 / 111_320), longitude: -110.97 };
const NOWHERE = { latitude: 32.22, longitude: -110.97 + (5_000 / 94_000) };

function config(lunch: LunchConfig = DEFAULT_LUNCH): TrackingConfig {
  return {
    shop: { id: 'shop-1', name: 'Shop', latitude: SHOP.latitude, longitude: SHOP.longitude, radiusMeters: 90 },
    sites: [
      { id: '101', name: 'Congress Site', latitude: JOB.latitude, longitude: JOB.longitude, radiusMeters: 90 },
      { id: '202', name: 'South Site', latitude: JOB_B.latitude, longitude: JOB_B.longitude, radiusMeters: 90 },
    ],
    speedMph: 10,
    speedSustainMs: DEFAULT_SPEED_SUSTAIN_MS,
    dwellMs: DEFAULT_DWELL_MS,
    batteryEveryMs: 15 * 60_000,
    safety: { ...DEFAULT_WORK_HOURS },
    lunch,
  };
}

let counter = 0;
const ids = () => `seg-${++counter}`;

function fix(at: number, where: { latitude: number; longitude: number }, mph = 0): Fix {
  return { at, latitude: where.latitude, longitude: where.longitude, speedMps: mph * MPH_TO_MPS, batteryPercent: 80 };
}

function run(state: MachineState, type: 'clock-in' | 'clock-out' | 'sample', f: Fix, cfg = config()): MachineState {
  const result = step(state, { type, fix: f }, cfg, ids);
  assert.equal(result.error, null, result.error ?? '');
  return result.state;
}

const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
// Wednesday 2026-10-28, Phoenix is UTC-7 all year.
const at = (hhmm: string, day = '2026-10-28') => Date.parse(`${day}T${hhmm}:00-07:00`);
const kinds = (state: MachineState) => state.segments.map(segment => segment.kind).join(',');

// ── Window math ────────────────────────────────────────────────────────────

{
  const window = lunchWindowOn(at('09:00'), DEFAULT_LUNCH);
  assert.equal(iso(window.start), '2026-10-28T18:00:00.000Z', '11:00 AM Phoenix');
  assert.equal(iso(window.end), '2026-10-28T18:30:00.000Z', '11:30 AM Phoenix');
  assert.equal(lunchWindowsBetween(at('08:00'), at('10:59'), DEFAULT_LUNCH).length, 0);
  assert.equal(lunchWindowsBetween(at('08:00'), at('11:00'), DEFAULT_LUNCH).length, 1);
  assert.equal(lunchWindowsBetween(at('11:10'), at('16:00'), DEFAULT_LUNCH).length, 0, 'started after lunch began');
  assert.equal(lunchWindowsBetween(at('08:00'), at('12:00', '2026-10-29'), DEFAULT_LUNCH).length, 2);
  assert.equal(lunchWindowsBetween(at('08:00'), at('12:00'), LUNCH_UNCONFIRMED).length, 0);
  assert.equal(parseClockMinutes('11:00:00'), 660);
  assert.equal(parseClockMinutes('11:30'), 690);
  assert.equal(parseClockMinutes('nope'), null);
  const fromRow = lunchFromSettingsRow({ lunch_enabled: true, lunch_start: '12:00:00', lunch_end: '12:45:00', lunch_paid: false });
  assert.deepEqual([fromRow.startMinute, fromRow.endMinute, fromRow.paid, fromRow.enabled], [720, 765, false, true]);
  assert.equal(sanitizeLunch({ startMinute: 700, endMinute: 690 }).startMinute, DEFAULT_LUNCH.startMinute, 'end before start falls back');
  assert.equal(LUNCH_UNCONFIRMED.enabled, false, 'off until server settings are read');
}

// ── Shop all morning: shop → lunch → shop ──────────────────────────────────

{
  let s = run(initialMachine(), 'clock-in', fix(at('08:00'), SHOP));
  s = run(s, 'sample', fix(at('10:59'), SHOP));
  assert.equal(openSegment(s)?.kind, 'shop');
  s = run(s, 'sample', fix(at('11:00') + 30_000, SHOP));
  assert.equal(kinds(s), 'shop,lunch');
  assert.equal(s.segments[0].endedAt, iso(at('11:00')), 'shop split exactly at 11:00');
  assert.equal(openSegment(s)?.startedAt, iso(at('11:00')));
  assert.equal(openSegment(s)?.jobName, 'Lunch');
  assert.equal(openSegment(s)?.jobId, null);

  // Driving off for food does not end lunch early or start Travel.
  s = run(s, 'sample', fix(at('11:10'), NOWHERE, 35));
  s = run(s, 'sample', fix(at('11:12'), NOWHERE, 35));
  assert.equal(openSegment(s)?.kind, 'lunch');

  // Back at the shop after 11:30 → shop resumes at 11:30.
  s = run(s, 'sample', fix(at('11:31'), SHOP));
  assert.equal(kinds(s), 'shop,lunch,shop');
  assert.equal(s.segments[1].endedAt, iso(at('11:30')));
  assert.equal(segmentMinutes(s.segments[1], at('12:00')), 30);
  assert.equal(openSegment(s)?.startedAt, iso(at('11:30')));

  // A second step past lunch does not add another.
  s = run(s, 'sample', fix(at('11:45'), SHOP));
  assert.equal(s.segments.filter(segment => segment.kind === 'lunch').length, 1);

  const rows = rowsFromTransition('crew-1', initialMachine(), s)
    .filter(row => row.table === 'time_segments' && row.record.kind === 'lunch');
  assert.equal(rows.length, 1, 'lunch row is queued for upsert');
  assert.equal(rows[0].record.job_id, null);
}

// ── On a job, phone asleep through lunch: job → lunch → same job ───────────

function onJob(): MachineState {
  let s = run(initialMachine(), 'clock-in', fix(at('08:00'), SHOP));
  s = run(s, 'sample', fix(at('08:10'), SHOP, 30));
  s = run(s, 'sample', fix(at('08:10') + DEFAULT_SPEED_SUSTAIN_MS, SHOP, 30));
  assert.equal(openSegment(s)?.kind, 'driving');
  s = run(s, 'sample', fix(at('08:29'), JOB, 30));
  s = run(s, 'sample', fix(at('08:30'), JOB));
  s = run(s, 'sample', fix(at('08:30') + DEFAULT_DWELL_MS, JOB));
  assert.equal(openSegment(s)?.kind, 'job');
  s = run(s, 'sample', fix(at('10:30'), JOB));
  return s;
}

{
  let s = onJob();
  s = run(s, 'sample', fix(at('11:45'), JOB));
  assert.equal(kinds(s), 'shop,driving,job,lunch,job');
  const [, , before, lunch, after] = s.segments;
  assert.equal(before.endedAt, iso(at('11:00')));
  assert.equal(lunch.startedAt, iso(at('11:00')));
  assert.equal(lunch.endedAt, iso(at('11:30')));
  assert.equal(after.startedAt, iso(at('11:30')));
  assert.equal(after.jobId, '101', 'resumes the same job');
  assert.equal(after.jobName, 'Congress Site');
  assert.equal(after.endedAt, null);
}

// ── Lunch at a different job → that job resumes ────────────────────────────

{
  let s = onJob();
  s = run(s, 'sample', fix(at('11:05'), JOB));
  assert.equal(openSegment(s)?.kind, 'lunch');
  s = run(s, 'sample', fix(at('11:35'), JOB_B));
  const resumed = openSegment(s);
  assert.equal(resumed?.kind, 'job');
  assert.equal(resumed?.jobId, '202');
  assert.equal(resumed?.startedAt, iso(at('11:30')));
}

// ── Moving and outside every fence after lunch → Travel ────────────────────

{
  let s = onJob();
  s = run(s, 'sample', fix(at('11:05'), JOB));
  s = run(s, 'sample', fix(at('11:31'), NOWHERE, 40));
  assert.equal(openSegment(s)?.kind, 'driving');
  assert.equal(openSegment(s)?.startedAt, iso(at('11:30')));
}

// ── Lunch while driving: driving → lunch → driving ─────────────────────────

{
  let s = run(initialMachine(), 'clock-in', fix(at('10:40'), SHOP));
  s = run(s, 'sample', fix(at('10:50'), SHOP, 30));
  s = run(s, 'sample', fix(at('10:50') + DEFAULT_SPEED_SUSTAIN_MS, NOWHERE, 30));
  assert.equal(openSegment(s)?.kind, 'driving');
  s = run(s, 'sample', fix(at('11:01'), NOWHERE, 30));
  assert.equal(kinds(s), 'shop,driving,lunch');
  s = run(s, 'sample', fix(at('11:30'), NOWHERE, 30));
  assert.equal(kinds(s), 'shop,driving,lunch,driving');
}

// ── Clock-out during lunch ends lunch there ────────────────────────────────

{
  let s = run(initialMachine(), 'clock-in', fix(at('08:00'), SHOP));
  s = run(s, 'sample', fix(at('11:02'), SHOP));
  s = run(s, 'clock-out', fix(at('11:15'), SHOP));
  assert.equal(s.shift?.endReason, 'clock_out');
  assert.equal(kinds(s), 'shop,lunch');
  assert.equal(s.segments[1].endedAt, iso(at('11:15')));
  assert.equal(openSegment(s), null);
}

// ── Clock-out after lunch with no samples in between still records lunch ──

{
  let s = run(initialMachine(), 'clock-in', fix(at('08:00'), SHOP));
  s = run(s, 'clock-out', fix(at('14:00'), SHOP));
  assert.equal(kinds(s), 'shop,lunch,shop');
  assert.equal(s.segments[2].endedAt, iso(at('14:00')));
}

// ── Started after 11:00 → no lunch that day ────────────────────────────────

{
  let s = run(initialMachine(), 'clock-in', fix(at('11:10'), SHOP));
  s = run(s, 'sample', fix(at('12:00'), SHOP));
  s = run(s, 'clock-out', fix(at('15:00'), SHOP));
  assert.equal(s.segments.some(segment => segment.kind === 'lunch'), false);
}

// ── Disabled or unconfirmed → no lunch ─────────────────────────────────────

{
  const off = config(LUNCH_UNCONFIRMED);
  let s = run(initialMachine(), 'clock-in', fix(at('08:00'), SHOP), off);
  s = run(s, 'sample', fix(at('11:15'), SHOP), off);
  s = run(s, 'clock-out', fix(at('12:00'), SHOP), off);
  assert.equal(kinds(s), 'shop');
}

// ── Safety stop after a sleeping phone: lunch first, then auto_stop ───────

{
  let s = run(initialMachine(), 'clock-in', fix(at('08:00'), SHOP));
  s = run(s, 'sample', fix(at('10:00'), SHOP));
  s = run(s, 'sample', fix(at('18:00'), SHOP));
  assert.equal(s.shift?.endReason, 'auto_stop');
  assert.equal(s.shift?.endedAt, iso(at('17:00')));
  assert.equal(kinds(s), 'shop,lunch,shop');
  assert.equal(s.segments[1].endedAt, iso(at('11:30')));
  assert.equal(s.segments[2].endedAt, iso(at('17:00')));
}

// ── Saturday shift still gets lunch; custom window ─────────────────────────

{
  const late: LunchConfig = { ...DEFAULT_LUNCH, startMinute: 12 * 60, endMinute: 12 * 60 + 45 };
  let s = run(initialMachine(), 'clock-in', fix(at('07:00', '2026-10-31'), SHOP), config(late));
  s = run(s, 'sample', fix(at('12:50', '2026-10-31'), SHOP), config(late));
  assert.equal(kinds(s), 'shop,lunch,shop');
  assert.equal(s.segments[1].startedAt, iso(at('12:00', '2026-10-31')));
  assert.equal(s.segments[1].endedAt, iso(at('12:45', '2026-10-31')));
}

// ── Contiguous segments: no gap or overlap around lunch ────────────────────

{
  let s = onJob();
  s = run(s, 'sample', fix(at('11:45'), JOB));
  s = run(s, 'clock-out', fix(at('15:30'), JOB));
  for (let i = 1; i < s.segments.length; i += 1) {
    assert.equal(s.segments[i].startedAt, s.segments[i - 1].endedAt, `segment ${i} starts where ${i - 1} ended`);
  }
}

console.log('lunch checks passed');
