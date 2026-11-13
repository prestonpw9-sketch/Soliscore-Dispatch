import { zonedLocalToDate, zonedParts } from '../geofence/workHours.ts';
import { formatClockMinutes, parseClockMinutes } from './lunch.ts';
import type { ClockInFlag } from './types.ts';

/**
 * Late and off-site clock-in. Clock-in is never blocked by location. A worker
 * who is away from the shop, or starting after the normal start time, can
 * start now or say they started earlier (same Phoenix day, not in the future,
 * not before 4:00 AM). The shift is flagged for payroll admins; no approval.
 */
export interface LateStartConfig {
  /**
   * The server has the late clock-in columns (read from payroll_settings).
   * Until then the phone only offers Start now and writes no flag columns,
   * so its outbox never queues rows an older database would reject.
   */
  ready: boolean;
  /** Minutes after Phoenix midnight. 360 = 6:00 AM. */
  normalStartMinute: number;
  /** Starting this many minutes after the normal start is not late yet. */
  lateGraceMinutes: number;
  /** Earliest claimed start, minutes after Phoenix midnight. 240 = 4:00 AM. */
  earliestMinute: number;
  timeZone: 'America/Phoenix';
}

export const DEFAULT_LATE_START: LateStartConfig = {
  ready: true,
  normalStartMinute: 6 * 60,
  lateGraceMinutes: 5,
  earliestMinute: 4 * 60,
  timeZone: 'America/Phoenix',
};

export const LATE_START_UNCONFIRMED: LateStartConfig = { ...DEFAULT_LATE_START, ready: false };

/** A claimed start within this much of the tap is just "now". */
export const BACKDATE_MIN_MS = 60_000;

export const CLOCK_IN_FLAG_LABEL: Record<ClockInFlag, string> = {
  late_clock_in: 'Late clock-in',
  backdated: 'Backdated start',
  off_site_start: 'Started away from shop',
  no_location: 'No location at start',
};

function minuteOfDay(atMs: number, config: LateStartConfig): number {
  const local = zonedParts(new Date(atMs), config.timeZone);
  return local.hour * 60 + local.minute;
}

function sameLocalDay(a: number, b: number, config: LateStartConfig): boolean {
  const x = zonedParts(new Date(a), config.timeZone);
  const y = zonedParts(new Date(b), config.timeZone);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

/** Wall-clock minute on the Phoenix day that contains `dayOfMs`. */
export function localMinuteOn(dayOfMs: number, minute: number, config: LateStartConfig = DEFAULT_LATE_START): number {
  const local = zonedParts(new Date(dayOfMs), config.timeZone);
  return zonedLocalToDate(
    config.timeZone, local.year, local.month, local.day, Math.floor(minute / 60), minute % 60,
  ).getTime();
}

/** "06:15" on the tap's Phoenix day → epoch ms. Null for a bad value. */
export function claimedStartFromClock(hhmm: string, tapMs: number, config: LateStartConfig = DEFAULT_LATE_START): number | null {
  const minute = parseClockMinutes(hhmm);
  if (minute == null || minute >= 24 * 60) return null;
  return localMinuteOn(tapMs, minute, config);
}

export function isLateStart(tapMs: number, config: LateStartConfig): boolean {
  return minuteOfDay(tapMs, config) > config.normalStartMinute + config.lateGraceMinutes;
}

/**
 * Start right away only at the shop and on time. Away from the shop, or late
 * even at the shop, ask Start now / I started earlier.
 */
export function startNeedsPrompt(args: { atShop: boolean; late: boolean }): boolean {
  return !args.atShop || args.late;
}

export type ClaimedStartProblem = 'invalid' | 'future' | 'other-day' | 'too-early' | 'overlaps';

export type ClaimedStartCheck =
  | { ok: true; startAt: number; backdated: boolean }
  | { ok: false; problem: ClaimedStartProblem; message: string };

/**
 * Same Phoenix day as the tap, not after the tap, not before the earliest
 * time (4:00 AM), and not before the end of an earlier shift that day.
 */
export function checkClaimedStart(
  claimedMs: number,
  tapMs: number,
  config: LateStartConfig,
  previousShiftEndMs: number | null = null,
): ClaimedStartCheck {
  if (!Number.isFinite(claimedMs) || !Number.isFinite(tapMs)) {
    return { ok: false, problem: 'invalid', message: 'Pick the time you started.' };
  }
  if (claimedMs > tapMs + BACKDATE_MIN_MS) {
    return { ok: false, problem: 'future', message: 'That time is in the future. Pick when you actually started.' };
  }
  if (!sameLocalDay(claimedMs, tapMs, config)) {
    return { ok: false, problem: 'other-day', message: 'The start has to be today. Ask a supervisor to fix an earlier day.' };
  }
  if (minuteOfDay(claimedMs, config) < config.earliestMinute) {
    return {
      ok: false,
      problem: 'too-early',
      message: `The earliest start you can enter is ${formatClockMinutes(config.earliestMinute)}.`,
    };
  }
  if (previousShiftEndMs != null && claimedMs < previousShiftEndMs) {
    return {
      ok: false,
      problem: 'overlaps',
      message: `You clocked out at ${formatPhoenixTime(previousShiftEndMs)}. Pick a start after that.`,
    };
  }
  const startAt = Math.min(claimedMs, tapMs);
  return { ok: true, startAt, backdated: tapMs - startAt >= BACKDATE_MIN_MS };
}

export function clockInFlags(args: {
  offSite: boolean;
  late: boolean;
  backdated: boolean;
  noLocation: boolean;
}): ClockInFlag[] {
  const flags: ClockInFlag[] = [];
  if (args.late) flags.push('late_clock_in');
  if (args.backdated) flags.push('backdated');
  if (args.offSite && !args.noLocation) flags.push('off_site_start');
  if (args.noLocation) flags.push('no_location');
  return flags;
}

export function formatPhoenixTime(atMs: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(atMs));
}

function miles(meters: number): string {
  const value = meters / 1609.344;
  return value >= 10 ? `${Math.round(value)} mi` : `${value.toFixed(1)} mi`;
}

/** One line for payroll: what was flagged and why. */
export function clockInNote(args: {
  flags: ClockInFlag[];
  startAt: number;
  tapAt: number;
  distanceFromShopM: number | null;
  reason: string | null;
  historyPoints: number;
}): string {
  const parts: string[] = [];
  if (args.flags.includes('off_site_start')) {
    parts.push(args.distanceFromShopM != null
      ? `Started ${miles(args.distanceFromShopM)} from the shop.`
      : 'Started away from the shop.');
  }
  if (args.flags.includes('no_location')) parts.push('No location fix at start.');
  if (args.flags.includes('backdated')) {
    parts.push(`Said they started at ${formatPhoenixTime(args.startAt)}; tapped Start at ${formatPhoenixTime(args.tapAt)}.`);
    parts.push(args.historyPoints > 0
      ? `Gap filled from ${args.historyPoints} saved location point${args.historyPoints === 1 ? '' : 's'}.`
      : 'No location history for the gap; marked unverified.');
  } else if (args.flags.includes('late_clock_in')) {
    parts.push(`Clocked in at ${formatPhoenixTime(args.tapAt)}.`);
  }
  const reason = args.reason?.replace(/\s+/g, ' ').trim();
  if (reason) parts.push(`Reason: ${reason.slice(0, 300)}`);
  return parts.join(' ');
}

/** payroll_settings row → LateStartConfig. A row without the columns is not ready. */
export function lateStartFromSettingsRow(row: Record<string, unknown> | null | undefined): LateStartConfig {
  if (!row || !('normal_start_time' in row)) return { ...LATE_START_UNCONFIRMED };
  const normal = parseClockMinutes(row.normal_start_time);
  const earliest = parseClockMinutes(row.backdate_earliest_time);
  const grace = Number(row.late_grace_minutes);
  return {
    ready: true,
    normalStartMinute: normal ?? DEFAULT_LATE_START.normalStartMinute,
    lateGraceMinutes: Number.isInteger(grace) && grace >= 0 && grace <= 240 ? grace : DEFAULT_LATE_START.lateGraceMinutes,
    earliestMinute: earliest ?? DEFAULT_LATE_START.earliestMinute,
    timeZone: 'America/Phoenix',
  };
}

export function sanitizeLateStart(value: unknown): LateStartConfig {
  if (!value || typeof value !== 'object') return { ...LATE_START_UNCONFIRMED };
  const raw = value as Partial<LateStartConfig>;
  const normal = Number(raw.normalStartMinute);
  const earliest = Number(raw.earliestMinute);
  const grace = Number(raw.lateGraceMinutes);
  return {
    ready: raw.ready === true,
    normalStartMinute: Number.isInteger(normal) && normal >= 0 && normal < 24 * 60 ? normal : DEFAULT_LATE_START.normalStartMinute,
    lateGraceMinutes: Number.isInteger(grace) && grace >= 0 && grace <= 240 ? grace : DEFAULT_LATE_START.lateGraceMinutes,
    earliestMinute: Number.isInteger(earliest) && earliest >= 0 && earliest < 24 * 60 ? earliest : DEFAULT_LATE_START.earliestMinute,
    timeZone: 'America/Phoenix',
  };
}
