import { loadJobGeofence, nativeDispatchPlatform } from '@/lib/geofence/nativeClient';
import {
  CLOCK_IN_REMINDER,
  REMINDER_OFF,
  reminderFailure,
  reminderStorageKey,
  reminderTimeInRange,
  sameReminderTime,
  sanitizeReminderPref,
  shouldSkipTodaysReminder,
  type ReminderFailure,
  type ReminderPlatform,
  type ReminderPref,
  type ReminderTime,
} from './clockInReminder.ts';

export function loadReminderPref(userId: string | null | undefined): ReminderPref {
  if (!userId) return { ...REMINDER_OFF };
  try {
    const raw = localStorage.getItem(reminderStorageKey(userId));
    return sanitizeReminderPref(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...REMINDER_OFF };
  }
}

function saveReminderPref(userId: string, pref: ReminderPref): void {
  try {
    localStorage.setItem(reminderStorageKey(userId), JSON.stringify(pref));
  } catch { /* private mode */ }
}

/** Every user on this phone who has the reminder on, newest change first. */
function remindersOn(exceptUserId?: string): ReminderPref[] {
  const on: ReminderPref[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('itdg-clockin-reminder:')) continue;
      if (exceptUserId && key === reminderStorageKey(exceptUserId)) continue;
      const pref = sanitizeReminderPref(JSON.parse(localStorage.getItem(key) ?? 'null'));
      if (pref.enabled) on.push(pref);
    }
  } catch { /* private mode */ }
  return on.sort((a, b) => (b.changedAt ?? '').localeCompare(a.changedAt ?? ''));
}

function reminderSpec(time: ReminderTime) {
  return {
    hour: time.hour,
    minute: time.minute,
    weekdays: [...CLOCK_IN_REMINDER.weekdays],
    label: CLOCK_IN_REMINDER.label,
    title: CLOCK_IN_REMINDER.title,
    body: CLOCK_IN_REMINDER.body,
  };
}

export type ReminderResult =
  | {
    ok: true;
    platform: ReminderPlatform;
    pref: ReminderPref;
    removed: boolean;
    /** Android: an older alarm at this time is still in Clock. */
    leftBehind: ReminderTime | null;
  }
  | { ok: false; reason: ReminderFailure };

/**
 * Turn the reminder on at `time` (default: this user's saved time). Also used
 * to move it: Android then adds a new Clock alarm and the old one stays until
 * the worker deletes it; iPhone replaces its notifications.
 */
export async function enableClockInReminder(userId: string, time?: ReminderTime): Promise<ReminderResult> {
  const platform = nativeDispatchPlatform();
  if (!platform) return { ok: false, reason: 'web' };
  const before = loadReminderPref(userId);
  const at = time ?? before;
  if (!reminderTimeInRange(at)) return { ok: false, reason: 'time-out-of-range' };
  const plugin = await loadJobGeofence();
  if (!plugin?.setClockInReminder) return { ok: false, reason: 'plugin-missing' };
  try {
    await plugin.setClockInReminder(reminderSpec(at));
  } catch (err) {
    return { ok: false, reason: reminderFailure(err) };
  }
  const pref: ReminderPref = {
    enabled: true,
    platform,
    changedAt: new Date().toISOString(),
    hour: at.hour,
    minute: at.minute,
  };
  saveReminderPref(userId, pref);
  const leftBehind = platform === 'android' && before.enabled && before.platform === 'android' && !sameReminderTime(before, at)
    ? { hour: before.hour, minute: before.minute }
    : null;
  return { ok: true, platform, pref, removed: false, leftBehind };
}

/**
 * Save a new time while the reminder is off. Nothing is set on the phone. A
 * time outside 4:00–9:00 AM isn't saved (the saved pref is returned as is).
 */
export function saveReminderTime(userId: string, time: ReminderTime): ReminderPref {
  const current = loadReminderPref(userId);
  if (!reminderTimeInRange(time)) return current;
  const pref: ReminderPref = { ...current, hour: time.hour, minute: time.minute };
  saveReminderPref(userId, pref);
  return pref;
}

export async function disableClockInReminder(userId: string, platformHint: ReminderPlatform | null): Promise<ReminderResult> {
  const platform = nativeDispatchPlatform() ?? platformHint;
  const before = loadReminderPref(userId);
  const pref: ReminderPref = {
    enabled: false,
    platform,
    changedAt: new Date().toISOString(),
    hour: before.hour,
    minute: before.minute,
  };
  saveReminderPref(userId, pref);
  if (!platform) return { ok: false, reason: 'web' };
  const plugin = await loadJobGeofence();
  const others = remindersOn(userId);
  if (others.length > 0) {
    // Another user on this shared phone still wants it. iPhone keeps one set
    // of notifications, so move them to that user's time; Android alarms are
    // separate per time, so leave them.
    if (platform === 'ios' && !sameReminderTime(others[0], before) && plugin?.setClockInReminder) {
      try {
        await plugin.setClockInReminder(reminderSpec(others[0]));
      } catch { /* keep the old notifications */ }
    }
    return { ok: true, platform, pref, removed: false, leftBehind: null };
  }
  if (!plugin?.cancelClockInReminder) return { ok: true, platform, pref, removed: false, leftBehind: null };
  try {
    const outcome = await plugin.cancelClockInReminder({ label: CLOCK_IN_REMINDER.label });
    return { ok: true, platform, pref, removed: outcome?.removed === true, leftBehind: null };
  } catch {
    return { ok: true, platform, pref, removed: false, leftBehind: null };
  }
}

/** Android: open Clock's alarm list so the worker can delete the alarm. */
export async function openClockAlarms(): Promise<boolean> {
  const plugin = await loadJobGeofence();
  if (!plugin?.openClockAlarms) return false;
  try {
    await plugin.openClockAlarms();
    return true;
  } catch {
    return false;
  }
}

/**
 * Called after a clock-in. iPhone drops today's notification when it is still
 * ahead; Android's Clock alarm can't be skipped by an app, so it is left.
 * The iPhone has one set of notifications: the most recently set time.
 */
export async function skipClockInReminderToday(nowMs = Date.now()): Promise<void> {
  if (nativeDispatchPlatform() !== 'ios') return;
  const active = remindersOn()[0];
  if (!active || !shouldSkipTodaysReminder(nowMs, true, active)) return;
  const plugin = await loadJobGeofence();
  try {
    await plugin?.skipClockInReminderToday?.();
  } catch { /* older app build */ }
}
