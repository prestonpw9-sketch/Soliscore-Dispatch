/**
 * Start-shift location rules: accuracy vs the shop fence, GPS timeout,
 * permission denial, and the messages those paths show.
 * Does not call the network or a device.
 *
 * Run: npm run test:shift
 */
import assert from 'node:assert/strict';
import { distanceMeters } from '../src/lib/geofence/distance.ts';
import { DEFAULT_WORK_HOURS } from '../src/lib/geofence/workHours.ts';
import {
  acquireStartFix,
  consentCancelledMessage,
  gpsTimeoutMessage,
  locateFailureMessage,
  nativeFailureReason,
  notAtShopMessage,
  otherStartErrorMessage,
  permissionDeniedMessage,
  watchForStartFix,
  withDeadline,
  type DeadlineWork,
  type GeoWatch,
  type NativePositionResult,
  type StartFix,
} from '../src/lib/shift/locate.ts';
import { countsAsInside, initialMachine, step } from '../src/lib/shift/machine.ts';
import type { TrackingConfig } from '../src/lib/shift/types.ts';

const SHOP = { latitude: 32.22, longitude: -110.97 };
const north = (meters: number) => SHOP.latitude + meters / 111_320;

assert.equal(countsAsInside(150, 90, 80), true);
assert.equal(countsAsInside(150, 90, 40), false);
assert.equal(countsAsInside(190, 90, 500), true);
assert.equal(countsAsInside(200, 90, 500), false);
assert.equal(countsAsInside(90, 90, null), true);
assert.equal(countsAsInside(91, 90, 0), false);

const awayLat = north(150);
const awayDistance = distanceMeters(awayLat, SHOP.longitude, SHOP.latitude, SHOP.longitude);
assert.ok(awayDistance > 140 && awayDistance < 160);

const cfg: TrackingConfig = {
  shop: { id: 'shop-1', name: 'Shop', ...SHOP, radiusMeters: 90 },
  sites: [],
  speedMph: 10,
  speedSustainMs: 30_000,
  dwellMs: 4 * 60_000,
  batteryEveryMs: 15 * 60_000,
  safety: { ...DEFAULT_WORK_HOURS },
};
let n = 0;
const ids = () => `id-${n++}`;
const at = Date.parse('2026-10-28T15:00:00.000Z');

const coarse = step(initialMachine(), {
  type: 'clock-in',
  fix: {
    at,
    latitude: awayLat,
    longitude: SHOP.longitude,
    speedMps: 0,
    batteryPercent: 80,
    accuracyM: 80,
  },
}, cfg, ids);
assert.equal(coarse.error, null);
assert.equal(coarse.state.shift?.endReason, null);

const tight = step(initialMachine(), {
  type: 'clock-in',
  fix: {
    at,
    latitude: awayLat,
    longitude: SHOP.longitude,
    speedMps: 0,
    batteryPercent: 80,
    accuracyM: 20,
  },
}, cfg, ids);
assert.equal(tight.error, 'not-at-shop');
assert.ok((tight.distanceM ?? 0) > 140);
assert.equal(tight.accuracyM, 20);
assert.match(notAtShopMessage(tight.distanceM ?? 0, 20, 90), /m from the shop \(±20 m accuracy\)/);

assert.match(gpsTimeoutMessage(), /GPS timed out/);
assert.match(permissionDeniedMessage(), /Location permission is denied/);
assert.match(permissionDeniedMessage(), /Settings/);
assert.match(consentCancelledMessage(), /cancelled/i);
assert.match(otherStartErrorMessage('already-started'), /already running/);
assert.match(otherStartErrorMessage('mystery'), /mystery/);

function manualWatch(): { watch: GeoWatch; emit: (fix: StartFix) => void; fail: (reason: 'denied' | 'timeout' | 'unavailable') => void; stopped: () => boolean } {
  let onFix: (fix: StartFix) => void = () => {};
  let onError: (reason: 'denied' | 'timeout' | 'unavailable') => void = () => {};
  let stopped = false;
  const watch: GeoWatch = (fix, error) => {
    onFix = fix;
    onError = error;
    return () => { stopped = true; };
  };
  return {
    watch,
    emit: fix => onFix(fix),
    fail: reason => onError(reason),
    stopped: () => stopped,
  };
}

const accurate = manualWatch();
let accurateTimer: (() => void) | null = null;
const accuratePromise = watchForStartFix(accurate.watch, {
  timeoutMs: 30_000,
  accuracyGoalM: 90,
  schedule: run => {
    accurateTimer = run;
    return () => { accurateTimer = null; };
  },
});
accurate.emit({ latitude: 1, longitude: 2, accuracyM: 40, speedMps: 0, at: 1 });
const accurateResult = await accuratePromise;
assert.equal(accurateResult.ok, true);
if (accurateResult.ok) assert.equal(accurateResult.quality, 'accurate');
assert.equal(accurate.stopped(), true);
assert.equal(accurateTimer, null);

const best = manualWatch();
let fireTimeout: (() => void) | null = null;
const bestPromise = watchForStartFix(best.watch, {
  timeoutMs: 30_000,
  accuracyGoalM: 90,
  schedule: run => {
    fireTimeout = run;
    return () => { fireTimeout = null; };
  },
});
best.emit({ latitude: 1, longitude: 2, accuracyM: 400, speedMps: null, at: 1 });
best.emit({ latitude: 3, longitude: 4, accuracyM: 120, speedMps: null, at: 2 });
assert.ok(fireTimeout);
fireTimeout?.();
const bestResult = await bestPromise;
assert.equal(bestResult.ok, true);
if (bestResult.ok) {
  assert.equal(bestResult.quality, 'best');
  assert.equal(bestResult.fix.accuracyM, 120);
}

const denied = manualWatch();
const deniedPromise = watchForStartFix(denied.watch, {
  timeoutMs: 30_000,
  accuracyGoalM: 90,
  schedule: () => () => {},
});
denied.fail('denied');
const deniedResult = await deniedPromise;
assert.deepEqual(deniedResult, { ok: false, reason: 'denied' });

const timedOut = manualWatch();
let fireEmpty: (() => void) | null = null;
const emptyPromise = watchForStartFix(timedOut.watch, {
  timeoutMs: 30_000,
  accuracyGoalM: 90,
  schedule: run => {
    fireEmpty = run;
    return () => { fireEmpty = null; };
  },
});
fireEmpty?.();
assert.deepEqual(await emptyPromise, { ok: false, reason: 'timeout' });

const coarseFix: StartFix = { latitude: 32.22, longitude: -110.97, accuracyM: 40, speedMps: 0, at: 5 };
const weakWatch: StartFix = { latitude: 32.221, longitude: -110.97, accuracyM: 180, speedMps: 0, at: 4 };

async function passthrough<T>(work: DeadlineWork<T>): Promise<T> {
  return typeof work === 'function' ? await work() : await work;
}

async function expire<T>(work: DeadlineWork<T>): Promise<{ timedOut: true }> {
  const job = typeof work === 'function' ? work() : work;
  void Promise.resolve(job).then(() => {}, () => {});
  return { timedOut: true };
}

const highHangs = acquireStartFix({
  nativePosition: () => new Promise<NativePositionResult>(() => {}),
  watch: onFix => {
    onFix(weakWatch);
    return () => {};
  },
  coarsePosition: async () => coarseFix,
}, {
  accuracyGoalM: 90,
  highAccuracyMs: 15_000,
  coarseMs: 10_000,
  withDeadline: expire,
});
const hungHigh = await highHangs;
assert.equal(hungHigh.ok, true);
if (hungHigh.ok) {
  assert.equal(hungHigh.quality, 'best');
  assert.equal(hungHigh.fix.accuracyM, 180);
}

let coarseCalled = false;
const allTimeout = await acquireStartFix({
  nativePosition: () => new Promise<NativePositionResult>(() => {}),
  watch: () => () => {},
  coarsePosition: async () => {
    coarseCalled = true;
    return new Promise<StartFix>(() => {});
  },
}, {
  accuracyGoalM: 90,
  highAccuracyMs: 15_000,
  coarseMs: 10_000,
  withDeadline: expire,
});
assert.equal(coarseCalled, true);
assert.deepEqual(allTimeout, { ok: false, reason: 'timeout' });
assert.match(locateFailureMessage('timeout'), /GPS timed out/);
assert.match(gpsTimeoutMessage(), /last-known position/);

let coarseAfterHigh = false;
const coarseHit = await acquireStartFix({
  nativePosition: () => new Promise<NativePositionResult>(() => {}),
  watch: () => () => {},
  coarsePosition: async () => {
    coarseAfterHigh = true;
    return coarseFix;
  },
}, {
  accuracyGoalM: 90,
  highAccuracyMs: 15_000,
  coarseMs: 10_000,
  withDeadline: async work => {
    const job = typeof work === 'function' ? work() : work;
    if (!coarseAfterHigh) {
      void Promise.resolve(job).then(() => {}, () => {});
      return { timedOut: true };
    }
    return job;
  },
});
assert.equal(coarseAfterHigh, true);
assert.equal(coarseHit.ok, true);
if (coarseHit.ok) assert.equal(coarseHit.fix.accuracyM, 40);

let coarseServiceCalls = 0;
const coarseServices = await acquireStartFix({
  nativePosition: () => new Promise<NativePositionResult>(() => {}),
  watch: () => () => {},
  coarsePosition: async () => {
    throw new Error('services-off');
  },
}, {
  accuracyGoalM: 90,
  highAccuracyMs: 15_000,
  coarseMs: 10_000,
  withDeadline: async work => {
    coarseServiceCalls += 1;
    const job = typeof work === 'function' ? work() : work;
    if (coarseServiceCalls === 1) {
      void Promise.resolve(job).then(() => {}, () => {});
      return { timedOut: true };
    }
    return job;
  },
});
assert.deepEqual(coarseServices, { ok: false, reason: 'services-off' });

let coarseOnFatal = false;
const services = await acquireStartFix({
  nativePosition: async () => ({ ok: false, reason: 'services-off' }),
  watch: () => () => {},
  coarsePosition: async () => {
    coarseOnFatal = true;
    return coarseFix;
  },
}, {
  accuracyGoalM: 90,
  highAccuracyMs: 15_000,
  coarseMs: 10_000,
  withDeadline: passthrough,
});
assert.equal(coarseOnFatal, false);
assert.deepEqual(services, { ok: false, reason: 'services-off' });
assert.match(locateFailureMessage('services-off'), /Location services are turned off/);

const deniedNative = await acquireStartFix({
  nativePosition: async () => ({ ok: false, reason: 'denied' }),
  watch: () => () => {},
  coarsePosition: async () => coarseFix,
}, {
  accuracyGoalM: 90,
  highAccuracyMs: 15_000,
  coarseMs: 10_000,
  withDeadline: passthrough,
});
assert.deepEqual(deniedNative, { ok: false, reason: 'denied' });
assert.match(permissionDeniedMessage(), /denied/);

const missing = await acquireStartFix({
  nativePosition: async () => ({ ok: false, reason: 'plugin-missing' }),
  watch: () => () => {},
  coarsePosition: async () => coarseFix,
}, {
  accuracyGoalM: 90,
  highAccuracyMs: 15_000,
  coarseMs: 10_000,
  withDeadline: passthrough,
});
assert.deepEqual(missing, { ok: false, reason: 'plugin-missing' });
assert.match(locateFailureMessage('plugin-missing'), /plugin is not available/);
assert.equal(nativeFailureReason(new Error('plugin-missing')), 'plugin-missing');
assert.equal(nativeFailureReason(new Error('services-off')), 'services-off');
assert.equal(nativeFailureReason(new Error('permission denied')), 'denied');

const preAborted = new AbortController();
preAborted.abort();
let startedAfterAbort = false;
const cancelled = await withDeadline(() => {
  startedAfterAbort = true;
  return new Promise<string>(() => {});
}, 30_000, preAborted.signal);
assert.equal(startedAfterAbort, false);
assert.deepEqual(cancelled, { cancelled: true });

const rejected = await withDeadline(Promise.reject(new Error('denied')), 5_000);
assert.deepEqual(rejected, { timedOut: true });

let thunkStarted = false;
const raced = await withDeadline(() => {
  thunkStarted = true;
  return new Promise<string>(() => {});
}, 40);
assert.equal(thunkStarted, true);
assert.equal('timedOut' in raced, true);

console.log('start locate checks passed');
