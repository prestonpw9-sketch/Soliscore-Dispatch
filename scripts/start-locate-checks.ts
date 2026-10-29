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
  consentCancelledMessage,
  gpsTimeoutMessage,
  notAtShopMessage,
  otherStartErrorMessage,
  permissionDeniedMessage,
  watchForStartFix,
  type GeoWatch,
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

assert.match(gpsTimeoutMessage(), /timed out after 30 seconds/);
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

console.log('start locate checks passed');
