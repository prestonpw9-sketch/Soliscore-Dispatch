import { zonedLocalToDate, zonedParts } from '../geofence/workHours.ts';

/**
 * Automatic lunch. Every shift day, a shift that is already open at the lunch
 * start gets a 'lunch' segment for the window (default 11:00-11:30 AM
 * America/Phoenix). The open segment is split around it and the right
 * segment resumes afterward. Clock-out or the safety stop during lunch ends
 * lunch there.
 */
export interface LunchConfig {
  enabled: boolean;
  /** Minutes after local midnight. 660 = 11:00 AM. */
  startMinute: number;
  /** Minutes after local midnight. 690 = 11:30 AM. */
  endMinute: number;
  /** Unpaid by default. Payroll adds it back when true. */
  paid: boolean;
  timeZone: 'America/Phoenix';
}

export const DEFAULT_LUNCH: LunchConfig = {
  enabled: true,
  startMinute: 11 * 60,
  endMinute: 11 * 60 + 30,
  paid: false,
  timeZone: 'America/Phoenix',
};

/**
 * Until the phone has read payroll_settings from the server, lunch stays off.
 * That way a phone running this build against a database without the
 * 'lunch' segment kind does not queue rows the server would reject.
 */
export const LUNCH_UNCONFIRMED: LunchConfig = { ...DEFAULT_LUNCH, enabled: false };

export interface LunchWindow {
  start: number;
  end: number;
}

function addDays(year: number, month: number, day: number, days: number) {
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

/** Lunch window on the local calendar day that contains `atMs`. */
export function lunchWindowOn(atMs: number, config: LunchConfig): LunchWindow {
  const local = zonedParts(new Date(atMs), config.timeZone);
  return windowFor(local.year, local.month, local.day, config);
}

function windowFor(year: number, month: number, day: number, config: LunchConfig): LunchWindow {
  const start = zonedLocalToDate(
    config.timeZone, year, month, day, Math.floor(config.startMinute / 60), config.startMinute % 60,
  ).getTime();
  const end = zonedLocalToDate(
    config.timeZone, year, month, day, Math.floor(config.endMinute / 60), config.endMinute % 60,
  ).getTime();
  return { start, end };
}

/**
 * Lunch windows that begin after `afterMs` (exclusive) and at or before
 * `untilMs`, oldest first. A shift that starts at or after a window's start
 * does not get that day's lunch.
 */
export function lunchWindowsBetween(afterMs: number, untilMs: number, config: LunchConfig): LunchWindow[] {
  if (!config.enabled || !(untilMs > afterMs)) return [];
  const windows: LunchWindow[] = [];
  const first = zonedParts(new Date(afterMs), config.timeZone);
  let cursor = { year: first.year, month: first.month, day: first.day };
  for (let step = 0; step < 14; step += 1) {
    const window = windowFor(cursor.year, cursor.month, cursor.day, config);
    if (window.start > untilMs) break;
    if (window.start > afterMs) windows.push(window);
    cursor = addDays(cursor.year, cursor.month, cursor.day, 1);
  }
  return windows;
}

export function sanitizeLunch(value: unknown, fallback: LunchConfig = DEFAULT_LUNCH): LunchConfig {
  if (!value || typeof value !== 'object') return { ...fallback };
  const raw = value as Partial<LunchConfig>;
  const startMinute = Number(raw.startMinute);
  const endMinute = Number(raw.endMinute);
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) return { ...fallback };
  if (startMinute < 0 || endMinute > 24 * 60 || endMinute <= startMinute) return { ...fallback };
  return {
    enabled: raw.enabled !== false,
    startMinute,
    endMinute,
    paid: raw.paid === true,
    timeZone: 'America/Phoenix',
  };
}

/** "11:00" or "11:00:00" (Postgres time) → minutes after midnight. */
export function parseClockMinutes(raw: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(raw ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return total <= 24 * 60 ? total : null;
}

export function formatClockMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** payroll_settings row → LunchConfig. */
export function lunchFromSettingsRow(row: {
  lunch_enabled?: unknown;
  lunch_start?: unknown;
  lunch_end?: unknown;
  lunch_paid?: unknown;
}): LunchConfig {
  const startMinute = parseClockMinutes(row.lunch_start);
  const endMinute = parseClockMinutes(row.lunch_end);
  return sanitizeLunch({
    enabled: row.lunch_enabled !== false,
    startMinute: startMinute ?? DEFAULT_LUNCH.startMinute,
    endMinute: endMinute ?? DEFAULT_LUNCH.endMinute,
    paid: row.lunch_paid === true,
    timeZone: 'America/Phoenix',
  });
}
