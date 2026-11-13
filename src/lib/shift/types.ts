import type { JobSite } from '../geofence/sites.ts';
import type { WorkHoursConfig } from '../geofence/workHours.ts';
import type { LateStartConfig } from './lateStart.ts';
import type { LunchConfig } from './lunch.ts';

/** 'unverified' is time the worker claimed with no location to classify it. */
export type SegmentKind = 'shop' | 'driving' | 'job' | 'lunch' | 'unverified';
export type ShiftEndReason = 'clock_out' | 'auto_stop';
export type ClockInFlag = 'late_clock_in' | 'backdated' | 'off_site_start' | 'no_location';

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
  /** Automatic lunch window. Disabled until the server settings are read. */
  lunch: LunchConfig;
  /** Late / off-site start rules. Missing means not confirmed by the server. */
  lateStart?: LateStartConfig;
  /** Internal (gap rebuild): no snapping to a shop the phone was not inside. */
  strictShop?: boolean;
}

/** How a flagged shift was started. Null for a normal on-time start at the shop. */
export interface ClockInInfo {
  /** When the worker actually tapped Start. */
  tappedAt: string;
  flags: ClockInFlag[];
  note: string | null;
  /** Job picked at clock-in (on it, or driving to it). */
  startJobId: string | null;
}

export interface Shift {
  id: string;
  startedAt: string;
  endedAt: string | null;
  endReason: ShiftEndReason | null;
  batteryStart: number | null;
  batteryEnd: number | null;
  /** Null when the phone had no location fix at clock-in. */
  startLatitude: number | null;
  startLongitude: number | null;
  clockIn?: ClockInInfo | null;
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
  /** Rebuilt after the fact from saved location points (late clock-in gap). */
  backfilled?: boolean;
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

export interface ClockInOptions {
  /** Worker says they started earlier than the tap (epoch ms). */
  claimedStartAt?: number | null;
  /** Job they are on or driving to. */
  jobId?: string | null;
  jobName?: string | null;
  /** Saved location points from the gap between claimed start and the tap. */
  history?: Fix[];
  /** No location fix: `fix` carries only the tap time and battery. */
  noFix?: boolean;
  reason?: string | null;
}

export type StepInput =
  | { type: 'clock-in'; fix: Fix; options?: ClockInOptions }
  | { type: 'clock-out'; fix: Fix }
  | { type: 'sample'; fix: Fix };

/** Clock-in is never rejected for location; only for these. */
export type StepError = 'already-started' | 'not-started' | 'bad-start-time' | 'late-start-unavailable';

export interface MachineState {
  shift: Shift | null;
  segments: TimeSegment[];
  lastSample: { at: number; latitude: number; longitude: number; accuracyM?: number | null } | null;
  motionSince: number | null;
  outsideSince: number | null;
  dwell: { placeKey: string; since: number } | null;
  /** Where and since when the phone has been sitting still while on Travel. */
  still?: { latitude: number; longitude: number; since: number } | null;
  lastBatteryAt: number | null;
  batterySamples: BatterySample[];
}

export const MPH_TO_MPS = 0.44704;

export const DEFAULT_SPEED_MPH = 10;
export const DEFAULT_SPEED_SUSTAIN_MS = 30_000;
export const DEFAULT_DWELL_MS = 4 * 60_000;
export const DEFAULT_BATTERY_EVERY_MS = 15 * 60_000;
