import { distanceMeters } from '../geofence/distance.ts';
import { clampRadius, type JobSite } from '../geofence/sites.ts';
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
}

export function initialMachine(): MachineState {
  return {
    shift: null,
    segments: [],
    lastSample: null,
    motionSince: null,
    outsideSince: null,
    dwell: null,
    lastBatteryAt: null,
    batterySamples: [],
  };
}

export function openSegment(state: MachineState): TimeSegment | null {
  const last = state.segments[state.segments.length - 1];
  if (!last || last.endedAt) return null;
  return last;
}

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

function inside(fix: Fix, place: Place): boolean {
  return distanceMeters(fix.latitude, fix.longitude, place.latitude, place.longitude) <= place.radiusMeters;
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
    implied = meters / ((fix.at - state.lastSample.at) / 1000);
  }
  return Math.max(reported, implied);
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

function closeOpen(state: MachineState, at: number, fix: Fix, battery: number | null): MachineState {
  const open = openSegment(state);
  if (!open) return state;
  const closed: TimeSegment = {
    ...open,
    endedAt: iso(at),
    endLatitude: fix.latitude,
    endLongitude: fix.longitude,
    batteryEnd: percent(battery),
  };
  return { ...state, segments: [...state.segments.slice(0, -1), closed] };
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
  const segment: TimeSegment = {
    id: ids(),
    shiftId: state.shift.id,
    kind,
    jobId: place?.kind === 'job' ? place.jobId : null,
    jobName: kind === 'driving' ? null : (place?.name ?? (kind === 'shop' ? 'Shop' : null)),
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
    lastSample: { at: fix.at, latitude: fix.latitude, longitude: fix.longitude },
  };
}

function rememberFix(state: MachineState, fix: Fix): MachineState {
  return {
    ...state,
    lastSample: { at: fix.at, latitude: fix.latitude, longitude: fix.longitude },
  };
}

function placeForOpen(open: TimeSegment, places: Place[]): Place | null {
  if (open.kind === 'shop') return places.find(place => place.kind === 'shop') ?? null;
  if (open.kind === 'job' && open.jobId) {
    return places.find(place => place.kind === 'job' && place.jobId === open.jobId) ?? null;
  }
  return null;
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
    if (!inside(fix, shop)) return { state, error: 'not-at-shop' };
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

  if (input.type === 'clock-out') {
    return { state: finishShift(state, fix.at, fix, 'clock_out', ids, config.batteryEveryMs), error: null };
  }

  const stopAt = safetyStopAt(Date.parse(state.shift.startedAt), config.safety);
  if (fix.at >= stopAt) {
    const stopFix: Fix = { ...fix, at: stopAt };
    return {
      state: finishShift(state, stopAt, stopFix, 'auto_stop', ids, config.batteryEveryMs),
      error: null,
    };
  }

  const open = openSegment(state);
  if (!open) return { state: rememberFix(state, fix), error: null };

  const speed = speedMps(state, fix);
  let next = state;

  if (open.kind === 'driving') {
    if (speed >= threshold) {
      next = { ...next, dwell: null, motionSince: null, outsideSince: null };
    } else {
      const place = nearestPlace(fix, places);
      if (!place) {
        next = { ...next, dwell: null };
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
      const since = next.motionSince ?? fix.at;
      if (next.motionSince == null) {
        next = { ...next, motionSince: fix.at, outsideSince: null };
      } else if (fix.at - since >= config.speedSustainMs) {
        next = switchTo(next, since, { ...fix, at: since }, 'driving', null, ids);
      }
    } else {
      next = { ...next, motionSince: null };
      if (!stillInside) {
        const since = next.outsideSince ?? fix.at;
        if (next.outsideSince == null) {
          next = { ...next, outsideSince: fix.at };
        } else if (fix.at - since >= config.speedSustainMs) {
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

/** Travel rows are driving. On-site rows are shop or a job. */
export function segmentMinutes(segment: TimeSegment, nowMs: number): number {
  const start = Date.parse(segment.startedAt);
  const end = segment.endedAt ? Date.parse(segment.endedAt) : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 60_000);
}
