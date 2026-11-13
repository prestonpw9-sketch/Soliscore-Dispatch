import { distanceMeters } from '../geofence/distance.ts';
import { clampRadius, type JobSite } from '../geofence/sites.ts';
import { lunchWindowOn, lunchWindowsBetween } from './lunch.ts';
import { safetyStopAt } from './safety.ts';
import {
  MPH_TO_MPS,
  type BatterySample,
  type Fix,
  type MachineState,
  type SegmentKind,
  type ShopLocation,
  type StepError,
  type StepInput,
  type TimeSegment,
  type TrackingConfig,
} from './types.ts';

interface Place {
  key: string;
  kind: 'shop' | 'job';
  jobId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface StepResult {
  state: MachineState;
  error: StepError | null;
  /** Meters from the shop when clock-in is rejected for distance. */
  distanceM?: number;
  accuracyM?: number | null;
}

export function initialMachine(): MachineState {
  return {
    shift: null,
    segments: [],
    lastSample: null,
    motionSince: null,
    outsideSince: null,
    dwell: null,
    still: null,
    lastBatteryAt: null,
    batterySamples: [],
  };
}

export function openSegment(state: MachineState): TimeSegment | null {
  const last = state.segments[state.segments.length - 1];
  if (!last || last.endedAt) return null;
  return last;
}

/** GPS noise floor for speed math. Phones wander 20-50 m while sitting still. */
export const JITTER_FLOOR_M = 35;
/** Being outside the fence has to last this long before Travel starts. */
export const OUTSIDE_EXIT_MS = 2 * 60_000;
/** While on Travel, sitting within this many meters for the dwell time is a stop. */
export const STILL_RADIUS_M = 120;
/** A stop this close to a fence (beyond its radius) goes back to that place. */
export const STILL_SNAP_M = 150;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function percent(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function shopPlace(shop: ShopLocation): Place | null {
  if (!Number.isFinite(shop.latitude) || !Number.isFinite(shop.longitude)) return null;
  return {
    key: 'shop',
    kind: 'shop',
    jobId: null,
    name: shop.name.trim() || 'Shop',
    latitude: shop.latitude,
    longitude: shop.longitude,
    radiusMeters: clampRadius(shop.radiusMeters),
  };
}

function jobPlace(site: JobSite): Place | null {
  if (!site.id || !Number.isFinite(site.latitude) || !Number.isFinite(site.longitude)) return null;
  return {
    key: `job:${site.id}`,
    kind: 'job',
    jobId: site.id,
    name: site.name.trim() || 'Job',
    latitude: site.latitude,
    longitude: site.longitude,
    radiusMeters: clampRadius(site.radiusMeters),
  };
}

function placesOf(config: TrackingConfig): Place[] {
  const places: Place[] = [];
  if (config.shop) {
    const shop = shopPlace(config.shop);
    if (shop) places.push(shop);
  }
  for (const site of config.sites) {
    const place = jobPlace(site);
    if (place) places.push(place);
  }
  return places;
}

/** Don't treat a 1 km error circle as if the phone were at the fence. */
export const ACCURACY_CREDIT_CAP_M = 100;

/**
 * A fix counts as inside when the reported center, pulled toward the place by
 * its accuracy, still falls in the radius. Accuracy credit is capped so a
 * very coarse fix cannot swallow a neighboring job.
 */
export function countsAsInside(distanceM: number, radiusM: number, accuracyM: number | null | undefined): boolean {
  const reported = Number.isFinite(accuracyM) && (accuracyM ?? 0) > 0 ? accuracyM ?? 0 : 0;
  const credit = Math.min(reported, ACCURACY_CREDIT_CAP_M);
  return distanceM - credit <= radiusM;
}

function inside(fix: Fix, place: Place): boolean {
  const distance = distanceMeters(fix.latitude, fix.longitude, place.latitude, place.longitude);
  return countsAsInside(distance, place.radiusMeters, fix.accuracyM);
}

function nearestPlace(fix: Fix, places: Place[]): Place | null {
  let best: { place: Place; distance: number } | null = null;
  for (const place of places) {
    if (!inside(fix, place)) continue;
    const distance = distanceMeters(fix.latitude, fix.longitude, place.latitude, place.longitude);
    if (!best || distance < best.distance) best = { place, distance };
  }
  return best?.place ?? null;
}

function speedMps(state: MachineState, fix: Fix): number {
  const reported = fix.speedMps != null && Number.isFinite(fix.speedMps) && fix.speedMps >= 0
    ? fix.speedMps
    : 0;
  let implied = 0;
  if (state.lastSample && fix.at > state.lastSample.at) {
    const meters = distanceMeters(
      state.lastSample.latitude,
      state.lastSample.longitude,
      fix.latitude,
      fix.longitude,
    );
    // Subtract the error circles so a fix that wobbles 40 m in 5 s is not
    // read as 18 mph.
    const noise = Math.max(
      JITTER_FLOOR_M,
      (fix.accuracyM ?? 0) + (state.lastSample.accuracyM ?? 0),
    );
    implied = Math.max(0, meters - noise) / ((fix.at - state.lastSample.at) / 1000);
  }
  // A reported speed from a coarse fix is noise too.
  const trusted = fix.accuracyM != null && fix.accuracyM > 100 ? 0 : reported;
  return Math.max(trusted, implied);
}

function pushBattery(
  state: MachineState,
  at: number,
  level: number | null,
  shiftId: string,
  ids: () => string,
  everyMs: number,
  force: boolean,
): MachineState {
  const battery = percent(level);
  if (battery == null) return state;
  const due = force || state.lastBatteryAt == null || at - state.lastBatteryAt >= everyMs;
  if (!due) return state;
  if (state.batterySamples.some(sample => sample.sampledAt === iso(at) && sample.shiftId === shiftId)) {
    return { ...state, lastBatteryAt: at };
  }
  const sample: BatterySample = {
    id: ids(),
    shiftId,
    sampledAt: iso(at),
    batteryPercent: battery,
  };
  return {
    ...state,
    lastBatteryAt: at,
    batterySamples: [...state.batterySamples, sample],
  };
}

/**
 * Close every open segment at `at`. Normally only the last row is open, but a
 * state restored from an older build (or a second tab) can hold more than
 * one; leaving any of them open lets it run forever on the server.
 */
function closeOpen(state: MachineState, at: number, fix: Fix, battery: number | null): MachineState {
  if (!state.segments.some(segment => !segment.endedAt)) return state;
  const segments = state.segments.map(segment => {
    if (segment.endedAt) return segment;
    const end = Math.max(at, Date.parse(segment.startedAt));
    return {
      ...segment,
      endedAt: iso(end),
      endLatitude: fix.latitude,
      endLongitude: fix.longitude,
      batteryEnd: percent(battery),
    };
  });
  return { ...state, segments };
}

function beginSegment(
  state: MachineState,
  at: number,
  fix: Fix,
  kind: SegmentKind,
  place: Place | null,
  ids: () => string,
): MachineState {
  if (!state.shift) return state;
  // Never start before clock-in or before the row it follows, and never
  // leave the previous row open.
  const floor = Math.max(
    Date.parse(state.shift.startedAt),
    ...state.segments.map(item => Date.parse(item.startedAt)).filter(Number.isFinite),
  );
  at = Math.max(at, floor);
  fix = { ...fix, at };
  state = closeOpen(state, at, fix, fix.batteryPercent);
  const segment: TimeSegment = {
    id: ids(),
    shiftId: state.shift.id,
    kind,
    jobId: kind === 'job' && place?.kind === 'job' ? place.jobId : null,
    jobName: kind === 'driving'
      ? null
      : kind === 'lunch'
        ? 'Lunch'
        : (place?.name ?? (kind === 'shop' ? 'Shop' : null)),
    startedAt: iso(at),
    endedAt: null,
    startLatitude: fix.latitude,
    startLongitude: fix.longitude,
    endLatitude: null,
    endLongitude: null,
    batteryStart: percent(fix.batteryPercent),
    batteryEnd: null,
  };
  return {
    ...state,
    segments: [...state.segments, segment],
    motionSince: null,
    outsideSince: null,
    dwell: null,
    still: null,
  };
}

function switchTo(
  state: MachineState,
  at: number,
  fix: Fix,
  kind: SegmentKind,
  place: Place | null,
  ids: () => string,
): MachineState {
  const closed = closeOpen(state, at, fix, fix.batteryPercent);
  return beginSegment(closed, at, fix, kind, place, ids);
}

function finishShift(
  state: MachineState,
  at: number,
  fix: Fix,
  reason: 'clock_out' | 'auto_stop',
  ids: () => string,
  everyMs: number,
): MachineState {
  if (!state.shift || state.shift.endedAt) return state;
  const closed = closeOpen(state, at, fix, fix.batteryPercent);
  const withSample = pushBattery(closed, at, fix.batteryPercent, state.shift.id, ids, everyMs, true);
  return {
    ...withSample,
    shift: {
      ...state.shift,
      endedAt: iso(at),
      endReason: reason,
      batteryEnd: percent(fix.batteryPercent) ?? state.shift.batteryEnd,
    },
    motionSince: null,
    outsideSince: null,
    dwell: null,
    still: null,
    lastSample: { at: fix.at, latitude: fix.latitude, longitude: fix.longitude, accuracyM: fix.accuracyM ?? null },
  };
}

function rememberFix(state: MachineState, fix: Fix): MachineState {
  return {
    ...state,
    lastSample: { at: fix.at, latitude: fix.latitude, longitude: fix.longitude, accuracyM: fix.accuracyM ?? null },
  };
}

/** Closest place whose fence, grown by `extraM`, contains the fix. */
function placeWithin(fix: Fix, places: Place[], extraM: number): Place | null {
  let best: { place: Place; distance: number } | null = null;
  for (const place of places) {
    const distance = distanceMeters(fix.latitude, fix.longitude, place.latitude, place.longitude);
    if (distance > place.radiusMeters + extraM) continue;
    if (!best || distance < best.distance) best = { place, distance };
  }
  return best?.place ?? null;
}

function placeForOpen(open: TimeSegment, places: Place[]): Place | null {
  if (open.kind === 'shop') return places.find(place => place.kind === 'shop') ?? null;
  if (open.kind === 'job' && open.jobId) {
    return places.find(place => place.kind === 'job' && place.jobId === open.jobId) ?? null;
  }
  return null;
}

/**
 * Where to pick up after lunch. Same place as before lunch if the phone is
 * still inside it; otherwise whichever fence it is in now; otherwise Travel.
 * A shop or job segment whose fence is no longer in today's list resumes as
 * it was while the phone is not moving.
 */
function resumeAfterLunch(
  state: MachineState,
  at: number,
  fix: Fix,
  places: Place[],
  thresholdMps: number,
  ids: () => string,
): MachineState {
  const lunchIndex = state.segments.length - 1;
  const before = lunchIndex > 0 ? state.segments[lunchIndex - 1] : null;
  const atFix: Fix = { ...fix, at };
  const closed = closeOpen(state, at, atFix, fix.batteryPercent);

  if (before && (before.kind === 'shop' || before.kind === 'job')) {
    const prePlace = placeForOpen(before, places);
    if (prePlace && inside(fix, prePlace)) {
      return beginSegment(closed, at, atFix, before.kind, prePlace, ids);
    }
    if (!prePlace && (fix.speedMps ?? 0) < thresholdMps && !nearestPlace(fix, places)) {
      const same: Place = {
        key: before.kind === 'shop' ? 'shop' : `job:${before.jobId ?? ''}`,
        kind: before.kind,
        jobId: before.jobId,
        name: before.jobName ?? (before.kind === 'shop' ? 'Shop' : 'Job'),
        latitude: fix.latitude,
        longitude: fix.longitude,
        radiusMeters: 0,
      };
      return beginSegment(closed, at, atFix, before.kind, same, ids);
    }
  }
  const here = nearestPlace(fix, places);
  if (here) return beginSegment(closed, at, atFix, here.kind, here, ids);
  return beginSegment(closed, at, atFix, 'driving', null, ids);
}

/**
 * Insert any lunch window that has started by `untilMs`, and end an open
 * lunch whose window is over. Runs before the location logic on every step,
 * so a phone that was asleep through lunch still records it.
 */
function catchUpLunch(
  state: MachineState,
  untilMs: number,
  fix: Fix,
  config: TrackingConfig,
  places: Place[],
  thresholdMps: number,
  ids: () => string,
): MachineState {
  const lunch = config.lunch;
  if (!lunch?.enabled || !state.shift || state.shift.endedAt) return state;
  let next = state;

  const open = openSegment(next);
  if (open?.kind === 'lunch') {
    const began = Date.parse(open.startedAt);
    const end = Math.max(lunchWindowOn(began, lunch).end, began);
    if (untilMs < end) return next;
    next = resumeAfterLunch(next, end, fix, places, thresholdMps, ids);
  }

  const shiftStart = Date.parse(next.shift!.startedAt);
  for (const window of lunchWindowsBetween(shiftStart, untilMs, lunch)) {
    const taken = next.segments.some(segment => {
      if (segment.kind !== 'lunch') return false;
      const began = Date.parse(segment.startedAt);
      return began >= window.start && began < window.end;
    });
    if (taken) continue;
    // Never rewrite segments that already started after the window opened.
    if (next.segments.some(segment => Date.parse(segment.startedAt) > window.start)) continue;
    const startFix: Fix = { ...fix, at: window.start };
    next = closeOpen(next, window.start, startFix, fix.batteryPercent);
    next = beginSegment(next, window.start, startFix, 'lunch', null, ids);
    if (untilMs < window.end) break;
    next = resumeAfterLunch(next, window.end, fix, places, thresholdMps, ids);
  }
  return next;
}

export function step(
  state: MachineState,
  input: StepInput,
  config: TrackingConfig,
  ids: () => string,
): StepResult {
  const fix = input.fix;
  const places = placesOf(config);
  const shop = places.find(place => place.kind === 'shop') ?? null;
  const threshold = config.speedMph * MPH_TO_MPS;

  if (input.type === 'clock-in') {
    if (!shop) return { state, error: 'no-shop' };
    if (state.shift && !state.shift.endedAt) return { state, error: 'already-started' };
    if (!inside(fix, shop)) {
      return {
        state,
        error: 'not-at-shop',
        distanceM: distanceMeters(fix.latitude, fix.longitude, shop.latitude, shop.longitude),
        accuracyM: fix.accuracyM ?? null,
      };
    }
    const shiftId = ids();
    const started: MachineState = {
      ...initialMachine(),
      shift: {
        id: shiftId,
        startedAt: iso(fix.at),
        endedAt: null,
        endReason: null,
        batteryStart: percent(fix.batteryPercent),
        batteryEnd: null,
        startLatitude: fix.latitude,
        startLongitude: fix.longitude,
      },
      lastSample: { at: fix.at, latitude: fix.latitude, longitude: fix.longitude },
    };
    const opened = beginSegment(started, fix.at, fix, 'shop', shop, ids);
    const sampled = pushBattery(opened, fix.at, fix.batteryPercent, shiftId, ids, config.batteryEveryMs, true);
    return { state: sampled, error: null };
  }

  if (!state.shift || state.shift.endedAt) {
    return { state, error: input.type === 'clock-out' ? 'not-started' : null };
  }

  // Samples queued by the native tracker before this clock-in, or delivered
  // out of order, must not move segments.
  if (input.type === 'sample') {
    const shiftStart = Date.parse(state.shift.startedAt);
    if (fix.at < shiftStart) return { state, error: null };
    if (state.lastSample && fix.at < state.lastSample.at) return { state, error: null };
  }

  const stopAt = safetyStopAt(Date.parse(state.shift.startedAt), config.safety);
  const lunchUntil = input.type === 'clock-out' ? fix.at : Math.min(fix.at, stopAt);
  const withLunch = catchUpLunch(state, lunchUntil, fix, config, places, threshold, ids);

  if (input.type === 'clock-out') {
    return { state: finishShift(withLunch, fix.at, fix, 'clock_out', ids, config.batteryEveryMs), error: null };
  }

  if (fix.at >= stopAt) {
    const stopFix: Fix = { ...fix, at: stopAt };
    return {
      state: finishShift(withLunch, stopAt, stopFix, 'auto_stop', ids, config.batteryEveryMs),
      error: null,
    };
  }

  const open = openSegment(withLunch);
  if (!open) return { state: rememberFix(withLunch, fix), error: null };

  const speed = speedMps(withLunch, fix);
  let next = withLunch;

  if (open.kind === 'lunch') {
    // Location still updates during lunch; segments do not switch until it ends.
    next = rememberFix(next, fix);
    if (next.shift) {
      next = pushBattery(next, fix.at, fix.batteryPercent, next.shift.id, ids, config.batteryEveryMs, false);
    }
    return { state: next, error: null };
  }

  if (open.kind === 'driving') {
    if (speed >= threshold) {
      next = { ...next, dwell: null, motionSince: null, outsideSince: null, still: null };
    } else {
      const place = nearestPlace(fix, places);
      // Track how long the phone has sat in one spot.
      const still = next.still
        && distanceMeters(next.still.latitude, next.still.longitude, fix.latitude, fix.longitude) <= STILL_RADIUS_M
        ? next.still
        : { latitude: fix.latitude, longitude: fix.longitude, since: fix.at };
      next = { ...next, still };
      if (!place) {
        next = { ...next, dwell: null };
        // Parked just outside a fence (GPS drift at the shop): after the dwell
        // time, go back to that place instead of logging hours of Travel.
        if (fix.at - still.since >= config.dwellMs) {
          // Only the shop or the place just left: snapping to any nearby job
          // would let a big fence swallow the neighbor.
          const before = [...next.segments].reverse().find(item => item.kind === 'shop' || item.kind === 'job');
          const candidates = places.filter(item => item.kind === 'shop'
            || (before?.kind === 'job' && item.kind === 'job' && item.jobId === before.jobId));
          const near = placeWithin(fix, candidates, STILL_SNAP_M);
          if (near) {
            next = switchTo(next, still.since, { ...fix, at: still.since }, near.kind, near, ids);
          }
        }
      } else if (!next.dwell || next.dwell.placeKey !== place.key) {
        next = { ...next, dwell: { placeKey: place.key, since: fix.at } };
      } else if (fix.at - next.dwell.since >= config.dwellMs) {
        const began = next.dwell.since;
        next = switchTo(next, began, { ...fix, at: began }, place.kind, place, ids);
      }
    }
  } else {
    const here = placeForOpen(open, places);
    const stillInside = here ? inside(fix, here) : false;
    if (speed >= threshold) {
      // Moving fast counts once the phone is also outside the fence, so GPS
      // wobble while parked at the shop does not start Travel.
      const since = next.motionSince ?? fix.at;
      if (next.motionSince == null) {
        next = { ...next, motionSince: fix.at, outsideSince: null };
      }
      if (!stillInside && fix.at - since >= config.speedSustainMs) {
        next = switchTo(next, since, { ...fix, at: since }, 'driving', null, ids);
      }
    } else {
      next = { ...next, motionSince: null };
      // Sitting still just past the fence is GPS drift, not leaving.
      const nearby = stillInside || (here ? placeWithin(fix, [here], STILL_SNAP_M) != null : false);
      if (!nearby) {
        const since = next.outsideSince ?? fix.at;
        if (next.outsideSince == null) {
          next = { ...next, outsideSince: fix.at };
        } else if (fix.at - since >= Math.max(config.speedSustainMs, OUTSIDE_EXIT_MS)) {
          next = switchTo(next, since, { ...fix, at: since }, 'driving', null, ids);
        }
      } else {
        next = { ...next, outsideSince: null };
      }
    }
  }

  next = rememberFix(next, fix);
  if (next.shift) {
    next = pushBattery(next, fix.at, fix.batteryPercent, next.shift.id, ids, config.batteryEveryMs, false);
  }
  return { state: next, error: null };
}

/** Travel rows are driving. On-site rows are shop or a job. Lunch is its own row. */
export function segmentMinutes(segment: TimeSegment, nowMs: number): number {
  const start = Date.parse(segment.startedAt);
  const end = segment.endedAt ? Date.parse(segment.endedAt) : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 60_000);
}
