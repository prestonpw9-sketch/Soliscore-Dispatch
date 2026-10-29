import type { JobSite } from '../geofence/sites.ts';
import type { WorkHoursConfig } from '../geofence/workHours.ts';

export type SegmentKind = 'shop' | 'driving' | 'job';
export type ShiftEndReason = 'clock_out' | 'auto_stop';

export interface ShopLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface TrackingConfig {
  shop: ShopLocation | null;
  sites: JobSite[];
  /** Switch to driving at or above this speed. Default 10. */
  speedMph: number;
  /** How long that speed has to hold before the segment changes. */
  speedSustainMs: number;
  /** How long a stop inside a geofence has to hold before it counts. */
  dwellMs: number;
  /** Battery sample spacing while a shift is open. */
  batteryEveryMs: number;
  /** Closes a forgotten shift. Does not block clock-in. */
  safety: WorkHoursConfig;
}

export interface Shift {
  id: string;
  startedAt: string;
  endedAt: string | null;
  endReason: ShiftEndReason | null;
  batteryStart: number | null;
  batteryEnd: number | null;
  startLatitude: number;
  startLongitude: number;
}

export interface TimeSegment {
  id: string;
  shiftId: string;
  kind: SegmentKind;
  jobId: string | null;
  jobName: string | null;
  startedAt: string;
  endedAt: string | null;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  batteryStart: number | null;
  batteryEnd: number | null;
}

export interface BatterySample {
  id: string;
  shiftId: string;
  sampledAt: string;
  batteryPercent: number;
}

export interface Fix {
  at: number;
  latitude: number;
  longitude: number;
  speedMps: number | null;
  batteryPercent: number | null;
  /** Meters. Missing means the fix did not report accuracy. */
  accuracyM?: number | null;
}

export type StepInput =
  | { type: 'clock-in'; fix: Fix }
  | { type: 'clock-out'; fix: Fix }
  | { type: 'sample'; fix: Fix };

export type StepError = 'not-at-shop' | 'no-shop' | 'already-started' | 'not-started';

export interface MachineState {
  shift: Shift | null;
  segments: TimeSegment[];
  lastSample: { at: number; latitude: number; longitude: number } | null;
  motionSince: number | null;
  outsideSince: number | null;
  dwell: { placeKey: string; since: number } | null;
  lastBatteryAt: number | null;
  batterySamples: BatterySample[];
}

export const MPH_TO_MPS = 0.44704;

export const DEFAULT_SPEED_MPH = 10;
export const DEFAULT_SPEED_SUSTAIN_MS = 30_000;
export const DEFAULT_DWELL_MS = 4 * 60_000;
export const DEFAULT_BATTERY_EVERY_MS = 15 * 60_000;
