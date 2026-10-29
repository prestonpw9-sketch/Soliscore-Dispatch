/**
 * Segment state machine: shop, driving, and job, plus the offline upsert queue.
 * Does not call Supabase or the network.
 *
 * Run: npm run test:shift
 */
import assert from 'node:assert/strict';
import { clampRadius } from '../src/lib/geofence/sites.ts';
import { DEFAULT_WORK_HOURS } from '../src/lib/geofence/workHours.ts';
import { initialMachine, openSegment, segmentMinutes, step } from '../src/lib/shift/machine.ts';
import { flushOutbox, mergeAll, mergeOutbox, replayInto, type OutboxRow } from '../src/lib/shift/outbox.ts';
import { rowsFromTransition } from '../src/lib/shift/rows.ts';
import { nextEndBoundary, safetyStopAt } from '../src/lib/shift/safety.ts';
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

function idsFrom(start = 1): () => string {
  let n = start;
  return () => `id-${n++}`;
}

function config(overrides: Partial<TrackingConfig> = {}): TrackingConfig {
  return {
    shop: {
      id: 'shop-1',
      name: 'Shop',
      latitude: SHOP.latitude,
      longitude: SHOP.longitude,
      radiusMeters: 90,
    },
    sites: [{
      id: 'job-congress',
      name: 'Congress Site',
      latitude: JOB.latitude,
      longitude: JOB.longitude,
      radiusMeters: 90,
    }],
    speedMph: 10,
    speedSustainMs: DEFAULT_SPEED_SUSTAIN_MS,
    dwellMs: DEFAULT_DWELL_MS,
    batteryEveryMs: 15 * 60_000,
    safety: { ...DEFAULT_WORK_HOURS },
    ...overrides,
  };
}

function fix(at: number, latitude: number, longitude: number, speedMph: number | null, battery: number | null = 80): Fix {
  return {
    at,
    latitude,
    longitude,
    speedMps: speedMph == null ? null : speedMph * MPH_TO_MPS,
    batteryPercent: battery,
  };
}

function apply(state: MachineState, input: Parameters<typeof step>[1], cfg = config(), ids = idsFrom()): MachineState {
  const result = step(state, input, cfg, ids);
  assert.equal(result.error, null, result.error ?? '');
  return result.state;
}

const eightAm = Date.parse('2026-10-28T15:00:00.000Z');
const fivePmStop = Date.parse('2026-10-29T00:00:00.000Z');

assert.equal(new Date(safetyStopAt(eightAm, DEFAULT_WORK_HOURS)).toISOString(), '2026-10-29T00:00:00.000Z');
assert.equal(new Date(nextEndBoundary(eightAm, DEFAULT_WORK_HOURS)).toISOString(), '2026-10-29T00:00:00.000Z');

const startedAtFive = Date.parse('2026-10-29T00:00:00.000Z');
assert.equal(new Date(safetyStopAt(startedAtFive, DEFAULT_WORK_HOURS)).toISOString(), '2026-10-29T11:00:00.000Z');

const saturdayMorning = Date.parse('2026-10-31T15:00:00.000Z');
assert.equal(new Date(safetyStopAt(saturdayMorning, DEFAULT_WORK_HOURS)).toISOString(), '2026-11-01T02:00:00.000Z');

assert.equal(clampRadius(5_000), 200);
assert.equal(clampRadius(null), 90);

const ids = idsFrom();
const cfg = config();
let state = initialMachine();

const away = step(state, { type: 'clock-in', fix: fix(eightAm, 0, 0, 0, 90) }, cfg, ids);
assert.equal(away.error, 'not-at-shop');
assert.equal(away.state.shift, null);

const noShop = step(state, { type: 'clock-in', fix: fix(eightAm, SHOP.latitude, SHOP.longitude, 0, 90) }, config({ shop: null }), ids);
assert.equal(noShop.error, 'no-shop');

state = apply(state, { type: 'clock-in', fix: fix(eightAm, SHOP.latitude, SHOP.longitude, 0, 90) }, cfg, ids);
assert.equal(state.shift?.endReason, null);
assert.equal(openSegment(state)?.kind, 'shop');
assert.equal(state.batterySamples[0]?.batteryPercent, 90);
assert.equal(state.batterySamples.length, 1);

const again = step(state, { type: 'clock-in', fix: fix(eightAm + 1_000, SHOP.latitude, SHOP.longitude, 0, 90) }, cfg, ids);
assert.equal(again.error, 'already-started');

state = apply(state, { type: 'sample', fix: fix(eightAm + 1_000, SHOP.latitude, SHOP.longitude, 12, 90) }, cfg, ids);
assert.equal(openSegment(state)?.kind, 'shop');

state = apply(state, { type: 'sample', fix: fix(eightAm + 1_000 + DEFAULT_SPEED_SUSTAIN_MS, SHOP.latitude, SHOP.longitude, 12, 88) }, cfg, ids);
assert.equal(openSegment(state)?.kind, 'driving');
assert.equal(state.segments[0]?.kind, 'shop');
assert.equal(state.segments[0]?.endedAt, new Date(eightAm + 1_000).toISOString());
assert.equal(segmentMinutes(state.segments[0], eightAm), 0);

const driveStart = eightAm + 60_000;
state = initialMachine();
const driveIds = idsFrom(100);
state = apply(state, { type: 'clock-in', fix: fix(driveStart, SHOP.latitude, SHOP.longitude, 0, 70) }, cfg, driveIds);
state = apply(state, { type: 'sample', fix: fix(driveStart + 1_000, SHOP.latitude, SHOP.longitude, 30, 70) }, cfg, driveIds);
state = apply(state, {
  type: 'sample',
  fix: fix(driveStart + 1_000 + DEFAULT_SPEED_SUSTAIN_MS, JOB.latitude, JOB.longitude, 30, 70),
}, cfg, driveIds);
assert.equal(openSegment(state)?.kind, 'driving');

const arrived = driveStart + 1_000 + DEFAULT_SPEED_SUSTAIN_MS + 10_000;
state = apply(state, { type: 'sample', fix: fix(arrived, JOB.latitude, JOB.longitude, 0, 68) }, cfg, driveIds);
assert.equal(openSegment(state)?.kind, 'driving');
state = apply(state, { type: 'sample', fix: fix(arrived + 3 * 60_000, JOB.latitude, JOB.longitude, 0, 68) }, cfg, driveIds);
assert.equal(openSegment(state)?.kind, 'driving', 'three minutes is short of the default dwell');
state = apply(state, { type: 'sample', fix: fix(arrived + DEFAULT_DWELL_MS, JOB.latitude, JOB.longitude, 0, 66) }, cfg, driveIds);
const onSite = openSegment(state);
assert.equal(onSite?.kind, 'job');
assert.equal(onSite?.jobName, 'Congress Site');
assert.equal(onSite?.startedAt, new Date(arrived).toISOString());
const travel = state.segments.find(segment => segment.kind === 'driving');
assert.ok(travel);
assert.equal(travel?.endedAt, new Date(arrived).toISOString());
assert.ok(segmentMinutes(onSite!, arrived + DEFAULT_DWELL_MS) >= 4);

state = apply(state, { type: 'sample', fix: fix(arrived + DEFAULT_DWELL_MS + 5_000, JOB.latitude, JOB.longitude, 15, 66) }, cfg, driveIds);
assert.equal(openSegment(state)?.kind, 'job');
state = apply(state, {
  type: 'sample',
  fix: fix(arrived + DEFAULT_DWELL_MS + 5_000 + DEFAULT_SPEED_SUSTAIN_MS, JOB.latitude + 0.01, JOB.longitude, 15, 64),
}, cfg, driveIds);
assert.equal(openSegment(state)?.kind, 'driving');

const flyby = initialMachine();
const flyIds = idsFrom(200);
let flying = apply(flyby, { type: 'clock-in', fix: fix(eightAm, SHOP.latitude, SHOP.longitude, 0, 50) }, cfg, flyIds);
flying = apply(flying, { type: 'sample', fix: fix(eightAm + 1_000, SHOP.latitude, SHOP.longitude, 30, 50) }, cfg, flyIds);
flying = apply(flying, { type: 'sample', fix: fix(eightAm + 31_000, JOB.latitude, JOB.longitude, 30, 50) }, cfg, flyIds);
assert.equal(openSegment(flying)?.kind, 'driving');
flying = apply(flying, { type: 'sample', fix: fix(eightAm + 41_000, JOB.latitude, JOB.longitude, 30, 50) }, cfg, flyIds);
flying = apply(flying, { type: 'sample', fix: fix(eightAm + 51_000, JOB.latitude, JOB.longitude, 30, 50) }, cfg, flyIds);
assert.equal(openSegment(flying)?.kind, 'driving', 'driving through a site does not start a job');

const wide = config({
  sites: [{ id: 'wide', name: 'Wide', latitude: JOB.latitude, longitude: JOB.longitude, radiusMeters: 5_000 }],
});
const offset = JOB.latitude + (250 / 111_320);
let parked = apply(initialMachine(), { type: 'clock-in', fix: fix(eightAm, SHOP.latitude, SHOP.longitude, 0, 40) }, wide, idsFrom(300));
parked = apply(parked, { type: 'sample', fix: fix(eightAm + 1_000, SHOP.latitude, SHOP.longitude, 20, 40) }, wide, idsFrom(301));
parked = apply(parked, { type: 'sample', fix: fix(eightAm + 31_000, offset, JOB.longitude, 20, 40) }, wide, idsFrom(302));
assert.equal(openSegment(parked)?.kind, 'driving');
parked = apply(parked, { type: 'sample', fix: fix(eightAm + 32_000, offset, JOB.longitude, 0, 40) }, wide, idsFrom(303));
parked = apply(parked, { type: 'sample', fix: fix(eightAm + 32_000 + DEFAULT_DWELL_MS, offset, JOB.longitude, 0, 40) }, wide, idsFrom(304));
assert.equal(openSegment(parked)?.kind, 'driving', 'a miles-wide radius is clamped, so 250 m away is not on site');

let stopped = apply(
  initialMachine(),
  { type: 'clock-in', fix: fix(eightAm, SHOP.latitude, SHOP.longitude, 0, 77) },
  cfg,
  idsFrom(400),
);
stopped = apply(stopped, { type: 'sample', fix: fix(fivePmStop - 60_000, SHOP.latitude, SHOP.longitude, 0, 60) }, cfg, idsFrom(410));
assert.equal(stopped.shift?.endedAt, null);
stopped = apply(stopped, { type: 'sample', fix: fix(fivePmStop + 5 * 60_000, SHOP.latitude, SHOP.longitude, 0, 55) }, cfg, idsFrom(420));
assert.equal(stopped.shift?.endReason, 'auto_stop');
assert.equal(stopped.shift?.endedAt, new Date(fivePmStop).toISOString());
assert.equal(openSegment(stopped), null);
assert.equal(stopped.shift?.batteryEnd, 55);
assert.ok(stopped.batterySamples.some(sample => sample.batteryPercent === 77));
assert.ok(stopped.batterySamples.some(sample => sample.batteryPercent === 55));

let manual = apply(
  initialMachine(),
  { type: 'clock-in', fix: fix(eightAm, SHOP.latitude, SHOP.longitude, 0, 81) },
  cfg,
  idsFrom(500),
);
manual = apply(manual, { type: 'clock-out', fix: fix(eightAm + 3_600_000, SHOP.latitude, SHOP.longitude, 0, 74) }, cfg, idsFrom(510));
assert.equal(manual.shift?.endReason, 'clock_out');
assert.equal(manual.shift?.batteryStart, 81);
assert.equal(manual.shift?.batteryEnd, 74);
assert.equal(manual.segments[0]?.kind, 'shop');
assert.ok(manual.segments[0]?.endedAt);

const slowIds = idsFrom(600);
let implied = apply(initialMachine(), { type: 'clock-in', fix: fix(eightAm, SHOP.latitude, SHOP.longitude, null, 33) }, cfg, slowIds);
implied = apply(implied, {
  type: 'sample',
  fix: fix(eightAm + 10_000, SHOP.latitude + (200 / 111_320), SHOP.longitude, null, 33),
}, cfg, slowIds);
assert.equal(openSegment(implied)?.kind, 'shop');
implied = apply(implied, {
  type: 'sample',
  fix: fix(eightAm + 10_000 + DEFAULT_SPEED_SUSTAIN_MS, SHOP.latitude + (400 / 111_320), SHOP.longitude, null, 33),
}, cfg, slowIds);
assert.equal(openSegment(implied)?.kind, 'driving');

const userId = 'crew-1';
const before = initialMachine();
const after = apply(before, { type: 'clock-in', fix: fix(eightAm, SHOP.latitude, SHOP.longitude, 0, 91) }, cfg, idsFrom(700));
const firstRows = rowsFromTransition(userId, before, after);
assert.equal(firstRows.filter(row => row.table === 'shifts').length, 1);
assert.equal(firstRows.filter(row => row.table === 'time_segments').length, 1);
const closed = apply(after, { type: 'clock-out', fix: fix(eightAm + 60_000, SHOP.latitude, SHOP.longitude, 0, 90) }, cfg, idsFrom(710));
const secondRows = rowsFromTransition(userId, after, closed);
const queued = mergeAll(mergeAll([], firstRows), secondRows);
const segmentRows = queued.filter(row => row.table === 'time_segments');
assert.equal(segmentRows.length, 1);
assert.equal(segmentRows[0]?.record.ended_at, closed.segments[0]?.endedAt);

const db = new Map<string, Record<string, unknown>>();
async function upsert(row: OutboxRow): Promise<boolean> {
  const key = `${row.table}:${row.record.id}`;
  db.set(key, { ...db.get(key), ...row.record });
  return true;
}

const firstFlush = await flushOutbox(queued, upsert);
assert.equal(firstFlush.pending.length, 0);
const keysAfterFirst = [...db.keys()];
const secondFlush = await flushOutbox(queued, upsert);
assert.equal(secondFlush.pending.length, 0);
assert.deepEqual([...db.keys()].sort(), keysAfterFirst.sort());
assert.equal(db.size, keysAfterFirst.length);
const stored = replayInto(new Map(), [...queued, ...queued]);
assert.equal(stored.size, queued.length);

let failed = 0;
const flaky = await flushOutbox(queued, async row => {
  failed += 1;
  return row.table !== 'time_segments';
});
assert.ok(flaky.pending.some(row => row.table === 'time_segments'));
assert.equal(flaky.synced.some(row => row.table === 'time_segments'), false);
assert.ok(failed >= 1);

const replaced = mergeOutbox(
  [{ table: 'time_segments', record: { id: 'seg', ended_at: null, kind: 'shop' } }],
  { table: 'time_segments', record: { id: 'seg', ended_at: 'later', kind: 'shop' } },
);
assert.equal(replaced.length, 1);
assert.equal(replaced[0]?.record.ended_at, 'later');

console.log('shift checks passed');
