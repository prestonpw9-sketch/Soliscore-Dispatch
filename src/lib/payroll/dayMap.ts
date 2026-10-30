/**
 * Pure helpers for the Payroll day map. No React, no Leaflet, no Supabase,
 * so scripts/day-map-checks.ts can run them under plain Node.
 */

export type DayMapKind = 'shop' | 'driving' | 'job' | 'lunch';

export interface DayMapSegmentInput {
  id: string;
  kind: DayMapKind;
  job_id: number | string | null;
  job_name: string | null;
  started_at: string;
  ended_at: string | null;
  start_latitude?: number | string | null;
  start_longitude?: number | string | null;
  end_latitude?: number | string | null;
  end_longitude?: number | string | null;
}

export interface DayMapJobInput {
  id: string;
  customerName?: string | null;
  title?: string | null;
  address?: string | null;
  date?: string | null;
  endDate?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusM?: number | null;
}

export interface DayMapShopInput {
  id: string;
  name: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  radius_m?: number | string | null;
  active?: boolean | null;
}

export interface DayMapStop {
  /** 1-based, in time order. */
  number: number;
  lat: number;
  lng: number;
  segmentId: string;
  kind: DayMapKind;
  /** Start or end point of the segment. */
  edge: 'start' | 'end';
  jobName: string | null;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
}

export interface DayMapJobPin {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radiusM: number;
  visited: boolean;
  scheduled: boolean;
}

export interface DayMapShop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export const KIND_COLOR: Record<DayMapKind, string> = {
  shop: '#2563eb',
  driving: '#f59e0b',
  job: '#16a34a',
  lunch: '#a855f7',
};

export const KIND_NAME: Record<DayMapKind, string> = {
  shop: 'Shop',
  driving: 'Travel',
  job: 'On site',
  lunch: 'Lunch',
};

export const DEFAULT_RADIUS_M = 90;

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function validPoint(lat: number | null, lng: number | null): lat is number {
  return lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

function clampRadius(meters: number | null | undefined): number {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return DEFAULT_RADIUS_M;
  return Math.min(200, Math.max(30, meters));
}

/** Start and end points of each segment, numbered in time order. */
export function buildStops(segments: DayMapSegmentInput[]): DayMapStop[] {
  const sorted = [...segments].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const stops: DayMapStop[] = [];
  for (const segment of sorted) {
    const minutes = segment.ended_at
      ? Math.max(0, Math.round((Date.parse(segment.ended_at) - Date.parse(segment.started_at)) / 60000))
      : null;
    const base = {
      segmentId: segment.id,
      kind: segment.kind,
      jobName: segment.job_name,
      startedAt: segment.started_at,
      endedAt: segment.ended_at,
      minutes,
    };
    const sLat = num(segment.start_latitude);
    const sLng = num(segment.start_longitude);
    const eLat = num(segment.end_latitude);
    const eLng = num(segment.end_longitude);
    if (validPoint(sLat, sLng)) stops.push({ ...base, number: 0, lat: sLat, lng: sLng!, edge: 'start' });
    if (validPoint(eLat, eLng)) {
      const prev = stops[stops.length - 1];
      // Skip an end point that sits on top of the start point (under ~10 m).
      const same = prev && prev.segmentId === segment.id && distanceM(prev.lat, prev.lng, eLat, eLng!) < 10;
      if (!same) stops.push({ ...base, number: 0, lat: eLat, lng: eLng!, edge: 'end' });
    }
  }
  return stops.map((stop, index) => ({ ...stop, number: index + 1 }));
}

/** Pins of the jobs visited that day plus the jobs scheduled on it. */
export function buildJobPins(
  jobs: DayMapJobInput[],
  segments: DayMapSegmentInput[],
  workDate: string,
): DayMapJobPin[] {
  const visited = new Set(segments.filter(s => s.job_id != null).map(s => String(s.job_id)));
  const pins: DayMapJobPin[] = [];
  for (const job of jobs) {
    const lat = num(job.latitude);
    const lng = num(job.longitude);
    if (!validPoint(lat, lng)) continue;
    const isVisited = visited.has(String(job.id));
    const start = job.date ?? '';
    const end = job.endDate || start;
    const isScheduled = !!start && start <= workDate && end >= workDate;
    if (!isVisited && !isScheduled) continue;
    pins.push({
      id: String(job.id),
      name: job.customerName?.trim() || job.title?.trim() || 'Job',
      address: job.address?.trim() || '',
      lat,
      lng: lng!,
      radiusM: clampRadius(num(job.geofenceRadiusM)),
      visited: isVisited,
      scheduled: isScheduled,
    });
  }
  return pins;
}

export function buildShops(rows: DayMapShopInput[]): DayMapShop[] {
  const shops: DayMapShop[] = [];
  for (const row of rows) {
    if (row.active === false) continue;
    const lat = num(row.latitude);
    const lng = num(row.longitude);
    if (!validPoint(lat, lng)) continue;
    shops.push({ id: row.id, name: row.name?.trim() || 'Shop', lat, lng: lng!, radiusM: clampRadius(num(row.radius_m)) });
  }
  return shops;
}

/** [[south, west], [north, east]] around every point, or null when there are none. */
export function boundsOf(points: Array<{ lat: number; lng: number }>): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let s = 90, w = 180, n = -90, e = -180;
  for (const p of points) {
    s = Math.min(s, p.lat); n = Math.max(n, p.lat);
    w = Math.min(w, p.lng); e = Math.max(e, p.lng);
  }
  return [[s, w], [n, e]];
}

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

// ── Readable stops (merged places with names) ──────────────────────────────

/** A job pin or shop within this distance names a point "near <name>". */
export const NEAR_M = 300;
/** Consecutive points closer than this are one place on the map. */
export const SAME_PLACE_M = 60;

export interface DayMapPlace {
  number: number;
  lat: number;
  lng: number;
  kind: DayMapKind;
  /** e.g. "Shop", "DCS", "Ended near DCS", "Left Shop". */
  place: string;
  /** Short always-visible marker label, e.g. "Shop 11:14a". */
  label: string;
  firstAt: string;
  lastAt: string;
  /** Minutes spent here (first to last point), or the segment length for a single point. */
  minutes: number | null;
  /** Minutes of travel that ended at this place, if any. */
  travelMinutes: number | null;
  segmentIds: string[];
}

export function shortClock(iso: string, timeZone = 'America/Phoenix'): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .formatToParts(new Date(iso));
  const h = parts.find(p => p.type === 'hour')?.value ?? '';
  const m = parts.find(p => p.type === 'minute')?.value ?? '';
  const ap = (parts.find(p => p.type === 'dayPeriod')?.value ?? '').toLowerCase().startsWith('p') ? 'p' : 'a';
  return `${h}:${m}${ap}`;
}

export function nearestNamed(
  lat: number,
  lng: number,
  pins: DayMapJobPin[],
  shops: DayMapShop[],
  withinM = NEAR_M,
): { name: string; type: 'job' | 'shop'; meters: number } | null {
  let best: { name: string; type: 'job' | 'shop'; meters: number } | null = null;
  for (const pin of pins) {
    const d = distanceM(lat, lng, pin.lat, pin.lng);
    if (d <= Math.max(withinM, pin.radiusM) && (!best || d < best.meters)) best = { name: pin.name, type: 'job', meters: d };
  }
  for (const shop of shops) {
    const d = distanceM(lat, lng, shop.lat, shop.lng);
    if (d <= Math.max(withinM, shop.radiusM) && (!best || d < best.meters)) best = { name: shop.name, type: 'shop', meters: d };
  }
  return best;
}

function placeName(stop: DayMapStop, pins: DayMapJobPin[], shops: DayMapShop[]): string {
  const near = nearestNamed(stop.lat, stop.lng, pins, shops);
  if (stop.kind === 'job') return stop.jobName?.trim() || (near ? near.name : 'Job');
  if (stop.kind === 'lunch') return near ? `Lunch near ${near.name}` : 'Lunch';
  if (stop.kind === 'shop') return near?.type === 'shop' ? near.name : (stop.jobName?.trim() || 'Shop');
  // Driving: start = where they left, end = where they ended up.
  if (stop.edge === 'start') return near ? `Left ${near.name}` : 'Started driving';
  return near ? `Ended near ${near.name}` : 'Stopped driving';
}

function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
}

/**
 * Turn raw segment points into readable places: consecutive points at the
 * same spot merge into one numbered place, each named after the job, shop,
 * or nearest pinned job/shop within NEAR_M.
 */
export function buildPlaces(stops: DayMapStop[], pins: DayMapJobPin[], shops: DayMapShop[]): DayMapPlace[] {
  const places: DayMapPlace[] = [];
  let pendingTravel: number | null = null;
  for (const stop of stops) {
    const at = stop.edge === 'start' ? stop.startedAt : (stop.endedAt ?? stop.startedAt);
    const prev = places[places.length - 1];
    if (prev && distanceM(prev.lat, prev.lng, stop.lat, stop.lng) < SAME_PLACE_M) {
      prev.lastAt = at;
      prev.minutes = minutesBetween(prev.firstAt, prev.lastAt) || prev.minutes;
      if (!prev.segmentIds.includes(stop.segmentId)) prev.segmentIds.push(stop.segmentId);
      if (stop.kind === 'driving' && stop.edge === 'start') pendingTravel = stop.minutes;
      continue;
    }
    const place = placeName(stop, pins, shops);
    const isDrivingEnd = stop.kind === 'driving' && stop.edge === 'end';
    places.push({
      number: places.length + 1,
      lat: stop.lat,
      lng: stop.lng,
      kind: stop.kind,
      place,
      label: `${place} ${shortClock(at)}`,
      firstAt: at,
      lastAt: at,
      minutes: isDrivingEnd ? null : stop.minutes,
      travelMinutes: isDrivingEnd ? stop.minutes : pendingTravel,
      segmentIds: [stop.segmentId],
    });
    pendingTravel = stop.kind === 'driving' && stop.edge === 'start' ? stop.minutes : null;
  }
  return places;
}

/** Points are "far apart" when the fitted view would span more than this. */
export function spanKm(points: Array<{ lat: number; lng: number }>): number {
  const b = boundsOf(points);
  if (!b) return 0;
  return distanceM(b[0][0], b[0][1], b[1][0], b[1][1]) / 1000;
}
