import { distanceMeters } from '../geofence/distance.ts';
import { clampRadius, type JobSite } from '../geofence/sites.ts';
import {
  LATE_START_UNCONFIRMED,
  checkClaimedStart,
  clockInFlags,
  clockInNote,
  isLateStart,
} from './lateStart.ts';
import { lunchWindowOn, lunchWindowsBetween } from './lunch.ts';
import { safetyStopAt } from './safety.ts';
import {
  MPH_TO_MPS,
  type BatterySample,
  type ClockInFlag,
  type ClockInOptions,
  type Fix,
  type MachineState,
  type SegmentKind,
  type Shift,
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
  /** Clock-in only: meters from the shop, when both are known. */
  distanceM?: number | null;
  accuracyM?: number | null;
  /** Clock-in only: started outside the shop fence (or with no fix). */
  offSite?: boolean;
  /** Clock-in only: flags written on the shift. */
  flags?: ClockInFlag[];
  /** Clock-in only: saved location points used to fill a backdated gap. */
  historyPoints?: number;
  /** Why a backdated start was refused. */
  message?: string;
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

/** A fix with no coordinates (clock-in without location) stores nulls. */
function coord(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function hasPosition(fix: Fix): boolean {
  return Number.isFinite(fix.latitude) && Number.isFinite(fix.longitude);
}

/** The safety stop counts from the tap, so a backdated start is not cut short. */
function safetyBase(shift: Shift): number {
  const tapped = shift.clockIn?.tappedAt ? Date.parse(shift.clockIn.tappedAt) : NaN;
  return Number.isFinite(tapped) ? tapped : Date.parse(shift.startedAt);
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
      endLatitude: coord(fix.latitude),
      endLongitude: coord(fix.longitude),
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
  /** Travel only: the job picked at clock-in that the worker is driving to. */
  destination: { id: string; name: string | null } | null = null,
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
    jobId: kind === 'job' && place?.kind === 'job'
      ? place.jobId
      : (kind === 'driving' ? destination?.id ?? null : null),
    jobName: kind === 'driving'
      ? destination?.name ?? null
      : kind === 'lunch'
        ? 'Lunch'
        : kind === 'unverified'
          ? 'Unverified'
          : (place?.name ?? (kind === 'shop' ? 'Shop' : null)),
    startedAt: iso(at),
    endedAt: null,
    startLatitude: coord(fix.latitude),
    startLongitude: coord(fix.longitude),
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
    lastSample: hasPosition(fix)
      ? { at: fix.at, latitude: fix.latitude, longitude: fix.longitude, accuracyM: fix.accuracyM ?? null }
      : withSample.lastSample,
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
 * A shop or job row with no fence in today's list (an unpinned job picked at
 * clock-in, or a fence that dropped off) stays put while the phone is near
 * where the row started, instead of turning into Travel after two minutes.
 */
function anchorForOpen(open: TimeSegment): Place | null {
  if (open.kind !== 'shop' && open.kind !== 'job') return null;
  if (open.startLatitude == null || open.startLongitude == null) return null;
  return {
    key: open.kind === 'shop' ? 'shop' : `job:${open.jobId ?? ''}`,
    kind: open.kind,
    jobId: open.jobId,
    name: open.jobName ?? (open.kind === 'shop' ? 'Shop' : 'Job'),
    latitude: open.startLatitude,
    longitude: open.startLongitude,
    radiusMeters: clampRadius(null),
  };
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

  // Nothing to place the phone with: stays unverified until a fix arrives.
  if (!hasPosition(fix)) {
    return beginSegment(closed, at, atFix, 'unverified', null, ids);
  }

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
    if (state.shift && !state.shift.endedAt) return { state, error: 'already-started' };
    return clockIn(state, fix, input.options ?? {}, config, places, shop, threshold, ids);
  }

  if (!state.shift || state.shift.endedAt) {
    return { state, error: input.type === 'clock-out' ? 'not-started' : null };
  }

  // Samples queued by the native tracker before this clock-in (before the
  // tap, for a backdated start), or delivered out of order, must not move
  // segments.
  if (input.type === 'sample') {
    if (fix.at < safetyBase(state.shift)) return { state, error: null };
    if (state.lastSample && fix.at < state.lastSample.at) return { state, error: null };
  }

  return { state: advance(state, input.type, fix, config, places, threshold, ids), error: null };
}

/** Clock-out or one location sample on an open shift. */
function advance(
  state: MachineState,
  type: 'sample' | 'clock-out',
  fix: Fix,
  config: TrackingConfig,
  places: Place[],
  threshold: number,
  ids: () => string,
): MachineState {
  if (!state.shift) return state;
  const stopAt = safetyStopAt(safetyBase(state.shift), config.safety);
  const lunchUntil = type === 'clock-out' ? fix.at : Math.min(fix.at, stopAt);
  const withLunch = catchUpLunch(state, lunchUntil, fix, config, places, threshold, ids);

  if (type === 'clock-out') {
    return finishShift(withLunch, fix.at, fix, 'clock_out', ids, config.batteryEveryMs);
  }

  if (fix.at >= stopAt) {
    const stopFix: Fix = { ...fix, at: stopAt };
    return finishShift(withLunch, stopAt, stopFix, 'auto_stop', ids, config.batteryEveryMs);
  }

  const open = openSegment(withLunch);
  if (!open) return rememberFix(withLunch, fix);

  const speed = speedMps(withLunch, fix);
  let next = withLunch;

  if (open.kind === 'unverified') {
    // First real fix after an unknown stretch: start from wherever it is.
    const here = nearestPlace(fix, places);
    next = switchTo(next, fix.at, fix, here ? here.kind : 'driving', here, ids);
  } else if (open.kind === 'lunch') {
    // Location still updates during lunch; segments do not switch until it ends.
    next = rememberFix(next, fix);
    if (next.shift) {
      next = pushBattery(next, fix.at, fix.batteryPercent, next.shift.id, ids, config.batteryEveryMs, false);
    }
    return next;
  } else if (open.kind === 'driving') {
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
          // A rebuilt gap counts shop time only from a point inside the fence.
          const before = [...next.segments].reverse().find(item => item.kind === 'shop' || item.kind === 'job');
          const candidates = places.filter(item => (item.kind === 'shop' && !config.strictShop)
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
    const here = placeForOpen(open, places) ?? anchorForOpen(open);
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
  return next;
}

function located(fix: Fix): Fix | null {
  return hasPosition(fix) ? fix : null;
}

/** A fix with no position, used for time the phone cannot place. */
function blankFix(at: number, battery: number | null): Fix {
  return { at, latitude: NaN, longitude: NaN, speedMps: null, batteryPercent: battery, accuracyM: null };
}

/**
 * Rebuild claimed-start → tap from saved location points, using the same
 * speed and fence rules as a live shift. Time before the first point (all of
 * it, with no points) is one 'unverified' row. Shop time only comes from a
 * point inside the shop fence.
 */
function backfillGap(
  state: MachineState,
  startAt: number,
  tapAt: number,
  points: Fix[],
  config: TrackingConfig,
  places: Place[],
  threshold: number,
  ids: () => string,
): MachineState {
  const strict: TrackingConfig = { ...config, strictShop: true };
  let next = beginSegment(state, startAt, blankFix(startAt, null), 'unverified', null, ids);
  let last: Fix | null = null;
  for (const point of points) {
    if (last && point.at < last.at) continue;
    next = advance(next, 'sample', point, strict, places, threshold, ids);
    last = point;
  }
  // Lunch inside the gap, then pick up from the last point (or unverified).
  next = catchUpLunch(next, tapAt, last ?? blankFix(tapAt, null), strict, places, threshold, ids);
  return {
    ...next,
    segments: next.segments
      // A point right at the claimed start leaves a zero-length unverified row.
      .filter(segment => !(segment.kind === 'unverified' && segment.endedAt === segment.startedAt))
      .map(segment => (
      Date.parse(segment.startedAt) < tapAt && segment.kind !== 'unverified' && segment.kind !== 'lunch'
        ? { ...segment, backfilled: true }
        : segment
    )),
  };
}

/**
 * The row that starts at the tap. A picked job wins when the phone is in its
 * fence, or when that job has no fence and the phone is not moving. Otherwise
 * the fence the phone is in, otherwise Travel (toward the picked job).
 */
function startLive(
  state: MachineState,
  tapAt: number,
  fix: Fix,
  places: Place[],
  job: { id: string; name: string | null } | null,
  threshold: number,
  ids: () => string,
): MachineState {
  const open = openSegment(state);
  if (open?.kind === 'lunch') return state; // resumes when the window ends
  const at: Fix = { ...fix, at: tapAt };
  if (!hasPosition(fix)) return beginSegment(state, tapAt, at, 'unverified', null, ids);

  const picked = job ? places.find(place => place.kind === 'job' && place.jobId === job.id) ?? null : null;
  if (picked && inside(fix, picked)) return beginSegment(state, tapAt, at, 'job', picked, ids);
  const here = nearestPlace(fix, places);
  if (here) return beginSegment(state, tapAt, at, here.kind, here, ids);
  const moving = (fix.speedMps ?? 0) >= threshold;
  if (job && !picked && !moving) {
    const spot: Place = {
      key: `job:${job.id}`,
      kind: 'job',
      jobId: job.id,
      name: job.name?.trim() || 'Job',
      latitude: fix.latitude,
      longitude: fix.longitude,
      radiusMeters: clampRadius(null),
    };
    return beginSegment(state, tapAt, at, 'job', spot, ids);
  }
  return beginSegment(state, tapAt, at, 'driving', null, ids, job);
}

function clockIn(
  state: MachineState,
  fix: Fix,
  options: ClockInOptions,
  config: TrackingConfig,
  places: Place[],
  shop: Place | null,
  threshold: number,
  ids: () => string,
): StepResult {
  const rules = config.lateStart ?? LATE_START_UNCONFIRMED;
  const tapAt = fix.at;
  const position = options.noFix ? null : located(fix);
  const tapFix: Fix = position ?? blankFix(tapAt, fix.batteryPercent);
  const claimed = options.claimedStartAt ?? null;

  // Without the server columns only a plain Start now is possible.
  if (!rules.ready && (claimed != null || !position)) {
    return { state, error: 'late-start-unavailable' };
  }

  let startAt = tapAt;
  let backdated = false;
  if (claimed != null) {
    const previousEnd = state.shift?.endedAt ? Date.parse(state.shift.endedAt) : null;
    const check = checkClaimedStart(claimed, tapAt, rules, previousEnd);
    if (check.ok === false) return { state, error: 'bad-start-time', message: check.message };
    backdated = check.backdated;
    if (backdated) startAt = check.startAt;
  }

  const distanceM = position && shop
    ? distanceMeters(position.latitude, position.longitude, shop.latitude, shop.longitude)
    : null;
  const offSite = !position || !shop || !inside(position, shop);
  const flags = clockInFlags({ offSite, late: isLateStart(tapAt, rules), backdated, noLocation: !position });
  const jobId = options.jobId?.trim() || null;
  const job = jobId ? { id: jobId, name: options.jobName?.trim() || null } : null;

  const points = backdated
    ? (options.history ?? [])
      .filter(point => hasPosition(point) && point.at >= startAt && point.at < tapAt)
      .sort((a, b) => a.at - b.at)
    : [];

  const shiftId = ids();
  const recordFlags = rules.ready && (flags.length > 0 || job != null);
  let next: MachineState = {
    ...initialMachine(),
    shift: {
      id: shiftId,
      startedAt: iso(startAt),
      endedAt: null,
      endReason: null,
      batteryStart: percent(fix.batteryPercent),
      batteryEnd: null,
      startLatitude: position?.latitude ?? null,
      startLongitude: position?.longitude ?? null,
      clockIn: recordFlags
        ? {
          tappedAt: iso(tapAt),
          flags,
          note: clockInNote({
            flags,
            startAt,
            tapAt,
            distanceFromShopM: distanceM,
            reason: options.reason ?? null,
            historyPoints: points.length,
          }) || null,
          startJobId: jobId,
        }
        : null,
    },
  };

  if (backdated) next = backfillGap(next, startAt, tapAt, points, config, places, threshold, ids);
  next = startLive(next, tapAt, tapFix, places, job, threshold, ids);
  next = {
    ...next,
    motionSince: null,
    outsideSince: null,
    dwell: null,
    still: null,
    lastSample: position
      ? { at: tapAt, latitude: position.latitude, longitude: position.longitude, accuracyM: position.accuracyM ?? null }
      : null,
  };
  next = pushBattery(next, tapAt, fix.batteryPercent, shiftId, ids, config.batteryEveryMs, true);
  return {
    state: next,
    error: null,
    distanceM,
    accuracyM: position?.accuracyM ?? null,
    offSite,
    flags: recordFlags ? flags : [],
    historyPoints: points.length,
  };
}

/** Travel rows are driving. On-site rows are shop or a job. Lunch is its own row. */
export function segmentMinutes(segment: TimeSegment, nowMs: number): number {
  const start = Date.parse(segment.startedAt);
  const end = segment.endedAt ? Date.parse(segment.endedAt) : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 60_000);
}
