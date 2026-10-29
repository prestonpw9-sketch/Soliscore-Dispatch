import {
  zonedLocalToDate,
  zonedParts,
  type Weekday,
  type WorkHoursConfig,
} from '../geofence/workHours.ts';

function isWorkday(weekday: Weekday, config: WorkHoursConfig): boolean {
  if (!config.weekdaysOnly) return true;
  return weekday !== 'Sat' && weekday !== 'Sun';
}

function addDays(year: number, month: number, day: number, days: number) {
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

/**
 * First configured end-of-day that is strictly after `afterMs`.
 * Weekends are skipped when the safety window is weekdays only.
 */
export function nextEndBoundary(afterMs: number, config: WorkHoursConfig): number {
  const start = zonedParts(new Date(afterMs), config.timeZone);
  let year = start.year;
  let month = start.month;
  let day = start.day;
  for (let step = 0; step < 10; step += 1) {
    const noon = zonedLocalToDate(config.timeZone, year, month, day, 12, 0);
    const weekday = zonedParts(noon, config.timeZone).weekday;
    const end = zonedLocalToDate(config.timeZone, year, month, day, config.endHour, 0).getTime();
    if (isWorkday(weekday, config) && end > afterMs) return end;
    const next = addDays(year, month, day, 1);
    year = next.year;
    month = next.month;
    day = next.day;
  }
  return afterMs + (config.endHour - config.startHour) * 3_600_000;
}

/**
 * When a forgotten shift must close.
 * Uses the earlier of the configured end time and the length of the window
 * (default 6:00 AM to 4:00 PM, so 10 hours).
 */
export function safetyStopAt(startedAtMs: number, config: WorkHoursConfig): number {
  const windowMs = Math.max(1, config.endHour - config.startHour) * 3_600_000;
  return Math.min(startedAtMs + windowMs, nextEndBoundary(startedAtMs, config));
}
