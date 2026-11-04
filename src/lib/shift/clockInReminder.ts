/**
 * Opt-in weekday clock-in reminder. Off by default; each user turns it on in
 * Settings on their own phone and picks their own time between 4:00 and
 * 9:00 AM (6:00 AM unless they change it). Android sets a real alarm in the phone's Clock app. iPhone apps
 * cannot add Clock alarms, so iOS schedules a repeating local notification
 * instead. The alarm lives on the phone, so the setting is stored on the
 * phone (per signed-in user), not in the database. It rings every weekday,
 * holidays included.
 */
export type ReminderPlatform = 'android' | 'ios';

export interface ReminderTime {
  hour: number;
  minute: number;
}

export const DEFAULT_REMINDER_TIME: ReminderTime = { hour: 6, minute: 0 };

/** Allowed reminder times: 4:00 AM through 9:00 AM, both included. */
export const REMINDER_EARLIEST: ReminderTime = { hour: 4, minute: 0 };
export const REMINDER_LATEST: ReminderTime = { hour: 9, minute: 0 };

const minuteOfDay = (time: ReminderTime) => time.hour * 60 + time.minute;

export function reminderTimeInRange(time: ReminderTime): boolean {
  const at = minuteOfDay(time);
  return at >= minuteOfDay(REMINDER_EARLIEST) && at <= minuteOfDay(REMINDER_LATEST);
}

export const CLOCK_IN_REMINDER = {
  /** Monday–Friday, 1 = Monday … 7 = Sunday. Holidays are not skipped. */
  weekdays: [1, 2, 3, 4, 5],
  label: 'ITDG Dispatch clock in',
  title: 'Clock in',
  body: 'Time to clock in. Open ITDG Dispatch and tap Start.',
} as const;

export interface ReminderPref extends ReminderTime {
  enabled: boolean;
  /** Where the alarm or notification was set. */
  platform: ReminderPlatform | null;
  /** ISO time of the last change. */
  changedAt: string | null;
}

export const REMINDER_OFF: ReminderPref = { enabled: false, platform: null, changedAt: null, ...DEFAULT_REMINDER_TIME };

export function reminderStorageKey(userId: string): string {
  return `itdg-clockin-reminder:${userId}`;
}

function validTime(hour: unknown, minute: unknown): ReminderTime | null {
  if (typeof hour !== 'number' || typeof minute !== 'number') return null;
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function sanitizeReminderPref(value: unknown): ReminderPref {
  if (!value || typeof value !== 'object') return { ...REMINDER_OFF };
  const raw = value as Partial<ReminderPref>;
  const platform = raw.platform === 'android' || raw.platform === 'ios' ? raw.platform : null;
  // Prefs saved before the time was a choice have no hour/minute: 6:00. So
  // does a time outside 4:00–9:00 AM.
  const stored = validTime(raw.hour, raw.minute);
  const time = stored && reminderTimeInRange(stored) ? stored : DEFAULT_REMINDER_TIME;
  return {
    enabled: raw.enabled === true && platform != null,
    platform,
    changedAt: typeof raw.changedAt === 'string' ? raw.changedAt : null,
    hour: time.hour,
    minute: time.minute,
  };
}

/**
 * "06:30" (an <input type="time"> value) → time, or null if not a time. Does
 * not check the 4:00–9:00 AM range; see reminderTimeInRange.
 */
export function parseReminderTime(value: string): ReminderTime | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  return match ? validTime(Number(match[1]), Number(match[2])) : null;
}

/** Time → "06:30" for an <input type="time">. */
export function reminderTimeValue(time: ReminderTime): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

export function sameReminderTime(a: ReminderTime, b: ReminderTime): boolean {
  return a.hour === b.hour && a.minute === b.minute;
}

/** 1 = Monday … 7 = Sunday, in the phone's own time zone. */
function isoWeekday(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

function isReminderDay(date: Date): boolean {
  return (CLOCK_IN_REMINDER.weekdays as readonly number[]).includes(isoWeekday(date));
}

/**
 * Next reminder strictly after `nowMs`, in the phone's local time (that is
 * what the Clock alarm and the iOS calendar trigger use).
 */
export function nextReminderAt(nowMs: number, time: ReminderTime = DEFAULT_REMINDER_TIME): number {
  const now = new Date(nowMs);
  for (let offset = 0; offset < 8; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, time.hour, time.minute, 0, 0);
    if (day.getTime() > nowMs && isReminderDay(day)) return day.getTime();
  }
  return nowMs;
}

/**
 * Today's reminder can be skipped when the worker already clocked in on a
 * weekday before it goes off.
 */
export function shouldSkipTodaysReminder(
  nowMs: number,
  clockedIn: boolean,
  time: ReminderTime = DEFAULT_REMINDER_TIME,
): boolean {
  if (!clockedIn) return false;
  const now = new Date(nowMs);
  if (!isReminderDay(now)) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), time.hour, time.minute, 0, 0);
  return nowMs < today.getTime();
}

export function formatReminderTime(time: ReminderTime = DEFAULT_REMINDER_TIME): string {
  const hour12 = time.hour % 12 || 12;
  const suffix = time.hour < 12 ? 'AM' : 'PM';
  return `${hour12}:${String(time.minute).padStart(2, '0')} ${suffix}`;
}

const DAYS_TEXT = 'Monday to Friday, holidays included';

export const REMINDER_RANGE_MESSAGE =
  `Pick a time from ${formatReminderTime(REMINDER_EARLIEST)} to ${formatReminderTime(REMINDER_LATEST)}.`;

export function reminderOnMessage(platform: ReminderPlatform, time: ReminderTime = DEFAULT_REMINDER_TIME): string {
  const at = formatReminderTime(time);
  return platform === 'android'
    ? `Alarm set in your Clock app for ${at}, ${DAYS_TEXT}, named "${CLOCK_IN_REMINDER.label}". You can change its sound or snooze in Clock.`
    : `Reminder on: a notification at ${at}, ${DAYS_TEXT}. iPhone apps can't add Clock alarms, so this is a notification. Keep notifications for ITDG Dispatch turned on.`;
}

/**
 * The time changed while the reminder was on. Android adds a new Clock alarm
 * and can't delete the old one, so the worker has to delete it in Clock.
 * iPhone replaces its notifications.
 */
export function reminderTimeChangedMessage(platform: ReminderPlatform, from: ReminderTime, to: ReminderTime): string {
  if (platform === 'ios') return reminderOnMessage('ios', to);
  return `New alarm set in your Clock app for ${formatReminderTime(to)}, ${DAYS_TEXT}. Android doesn't let apps delete Clock alarms, so open Clock and delete the old ${formatReminderTime(from)} "${CLOCK_IN_REMINDER.label}" alarm.`;
}

export function reminderOffMessage(
  platform: ReminderPlatform,
  removed: boolean,
  time: ReminderTime = DEFAULT_REMINDER_TIME,
): string {
  if (removed) return 'Reminder off.';
  return platform === 'android'
    ? `Reminder off in the app. Android doesn't let apps delete Clock alarms, so open Clock and delete the ${formatReminderTime(time)} "${CLOCK_IN_REMINDER.label}" alarm.`
    : 'Reminder off.';
}

export type ReminderFailure =
  | 'web'
  | 'plugin-missing'
  | 'not-implemented'
  | 'no-clock-app'
  | 'notifications-denied'
  | 'time-out-of-range'
  | 'unknown';

export function reminderFailure(err: unknown): ReminderFailure {
  const text = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (code === 'UNIMPLEMENTED' || /not implemented/i.test(text)) return 'not-implemented';
  if (text === 'no-clock-app') return 'no-clock-app';
  if (text === 'notifications-denied') return 'notifications-denied';
  if (text === 'plugin-missing') return 'plugin-missing';
  return 'unknown';
}

export function reminderFailureMessage(reason: ReminderFailure, time: ReminderTime = DEFAULT_REMINDER_TIME): string {
  switch (reason) {
    case 'web':
      return 'The clock-in reminder works in the ITDG Dispatch phone app, not the browser.';
    case 'plugin-missing':
    case 'not-implemented':
      return 'This version of the app can\'t set reminders yet. Update ITDG Dispatch and try again.';
    case 'no-clock-app':
      return `No Clock app on this phone accepts alarms from other apps. Set a ${formatReminderTime(time)} weekday alarm in your Clock app yourself.`;
    case 'notifications-denied':
      return 'Notifications are off for ITDG Dispatch. Turn them on in Settings, Notifications, ITDG Dispatch, then try again.';
    case 'time-out-of-range':
      return REMINDER_RANGE_MESSAGE;
    default:
      return 'Could not set the reminder. Try again.';
  }
}
