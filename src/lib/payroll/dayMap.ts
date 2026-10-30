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
