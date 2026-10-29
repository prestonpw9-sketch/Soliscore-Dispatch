/**
 * Crew arrival monitoring window.
 * Hours are editable per phone. The zone stays America/Phoenix (no daylight
 * saving). Start is inclusive, end is exclusive: 6 and 16 means 6:00 AM
 * through 3:59 PM.
 */
export interface WorkHoursConfig {
  timeZone: 'America/Phoenix';
  startHour: number;
  endHour: number;
  weekdaysOnly: boolean;
}

export const DEFAULT_WORK_HOURS: WorkHoursConfig = {
  timeZone: 'America/Phoenix',
  startHour: 6,
  endHour: 16,
  weekdaysOnly: true,
};

const STORAGE_KEY = 'itdg-arrival-work-hours';

export type Weekday = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: Weekday;
}

const WEEKDAYS = new Set<Weekday>(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '';
  const weekday = pick('weekday') as Weekday;
  let hour = Number(pick('hour'));
  if (hour === 24) hour = 0;
  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour,
    minute: Number(pick('minute')),
    weekday: WEEKDAYS.has(weekday) ? weekday : 'Sun',
  };
}

/** Calendar date in the configured zone, YYYY-MM-DD. */
export function zonedDay(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

export function phoenixToday(date = new Date()): string {
  return zonedDay(date, DEFAULT_WORK_HOURS.timeZone);
}

function isWorkday(weekday: Weekday, config: WorkHoursConfig): boolean {
  if (!config.weekdaysOnly) return true;
  return weekday !== 'Sat' && weekday !== 'Sun';
}

export function isWithinWorkHours(date: Date, config: WorkHoursConfig = DEFAULT_WORK_HOURS): boolean {
  const parts = zonedParts(date, config.timeZone);
  if (!isWorkday(parts.weekday, config)) return false;
  return parts.hour >= config.startHour && parts.hour < config.endHour;
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC instant.
 * America/Phoenix is UTC−7 year round; the offset is still read from Intl
 * so the conversion follows that zone rather than a hard-coded number.
 */
export function zonedLocalToDate(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const seen = zonedParts(new Date(utcGuess), timeZone);
  const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  const offsetMs = seenAsUtc - utcGuess;
  return new Date(utcGuess - offsetMs);
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

export type BoundaryAction = 'start' | 'stop';

/** Next moment monitoring should start or stop. */
export function nextWorkHoursBoundary(
  now: Date,
  config: WorkHoursConfig = DEFAULT_WORK_HOURS,
): { at: Date; action: BoundaryAction } {
  const local = zonedParts(now, config.timeZone);
  if (isWithinWorkHours(now, config)) {
    return {
      at: zonedLocalToDate(config.timeZone, local.year, local.month, local.day, config.endHour, 0),
      action: 'stop',
    };
  }
  if (isWorkday(local.weekday, config) && local.hour < config.startHour) {
    return {
      at: zonedLocalToDate(config.timeZone, local.year, local.month, local.day, config.startHour, 0),
      action: 'start',
    };
  }
  let year = local.year;
  let month = local.month;
  let day = local.day;
  for (let step = 0; step < 8; step += 1) {
    const next = addCalendarDays(year, month, day, 1);
    year = next.year;
    month = next.month;
    day = next.day;
    const probe = zonedLocalToDate(config.timeZone, year, month, day, 12, 0);
    const weekday = zonedParts(probe, config.timeZone).weekday;
    if (isWorkday(weekday, config)) {
      return {
        at: zonedLocalToDate(config.timeZone, year, month, day, config.startHour, 0),
        action: 'start',
      };
    }
  }
  return {
    at: zonedLocalToDate(config.timeZone, year, month, day, config.startHour, 0),
    action: 'start',
  };
}

export function sanitizeWorkHours(value: unknown): WorkHoursConfig {
  if (!value || typeof value !== 'object') return { ...DEFAULT_WORK_HOURS };
  const raw = value as Partial<WorkHoursConfig>;
  const startHour = Number(raw.startHour);
  const endHour = Number(raw.endHour);
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 22) return { ...DEFAULT_WORK_HOURS };
  if (!Number.isInteger(endHour) || endHour <= startHour || endHour > 23) return { ...DEFAULT_WORK_HOURS };
  return {
    timeZone: 'America/Phoenix',
    startHour,
    endHour,
    weekdaysOnly: raw.weekdaysOnly !== false,
  };
}

export function loadWorkHours(): WorkHoursConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WORK_HOURS };
    return sanitizeWorkHours(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WORK_HOURS };
  }
}

export function saveWorkHours(config: WorkHoursConfig): WorkHoursConfig {
  const next = sanitizeWorkHours(config);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* private mode */ }
  window.dispatchEvent(new Event('itdg-work-hours'));
  return next;
}

export function formatHourLabel(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${suffix}`;
}
