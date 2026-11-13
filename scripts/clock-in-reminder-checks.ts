/**
 * Opt-in weekday clock-in reminder: off by default, stored per user, each
 * person's own time (6:00 AM default), next ring time, skip-today rule, and
 * the messages for Android vs iPhone. Dates are built in the machine's local
 * time zone, like the phone's alarm.
 *
 * Run: npm run test:reminder
 */
import assert from 'node:assert/strict';
import {
  CLOCK_IN_REMINDER,
  DEFAULT_REMINDER_TIME,
  REMINDER_EARLIEST,
  REMINDER_LATEST,
  REMINDER_OFF,
  REMINDER_RANGE_MESSAGE,
  formatReminderTime,
  nextReminderAt,
  parseReminderTime,
  reminderFailure,
  reminderFailureMessage,
  reminderOffMessage,
  reminderOnMessage,
  reminderStorageKey,
  reminderTimeChangedMessage,
  reminderTimeInRange,
  reminderTimeValue,
  sameReminderTime,
  sanitizeReminderPref,
  shouldSkipTodaysReminder,
} from '../src/lib/shift/clockInReminder.ts';

// 2026-11-02 is a Monday.
const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

// ── Defaults and storage ───────────────────────────────────────────────────

{
  assert.deepEqual(DEFAULT_REMINDER_TIME, { hour: 6, minute: 0 }, '6:00 AM unless the person picks another time');
  assert.deepEqual([...CLOCK_IN_REMINDER.weekdays], [1, 2, 3, 4, 5], 'Monday to Friday');
  assert.equal(CLOCK_IN_REMINDER.label, 'ITDG Dispatch clock in');
  assert.equal(formatReminderTime(), '6:00 AM');

  assert.deepEqual(sanitizeReminderPref(null), REMINDER_OFF, 'off by default');
  assert.deepEqual([REMINDER_OFF.hour, REMINDER_OFF.minute], [6, 0], 'default time 6:00');
  assert.deepEqual(sanitizeReminderPref('garbage'), REMINDER_OFF);
  assert.equal(sanitizeReminderPref({ enabled: true }).enabled, false, 'on needs a platform it was set on');
  assert.equal(sanitizeReminderPref({ enabled: 'yes', platform: 'ios' }).enabled, false);
  assert.deepEqual(
    sanitizeReminderPref({ enabled: true, platform: 'android', changedAt: '2026-11-02T13:00:00Z' }),
    { enabled: true, platform: 'android', changedAt: '2026-11-02T13:00:00Z', hour: 6, minute: 0 },
    'a pref saved before times were a choice reads as 6:00',
  );
  assert.deepEqual(
    sanitizeReminderPref({ enabled: true, platform: 'ios', changedAt: null, hour: 5, minute: 30 }),
    { enabled: true, platform: 'ios', changedAt: null, hour: 5, minute: 30 },
    'each person keeps their own time',
  );
  assert.deepEqual(
    sanitizeReminderPref({ enabled: false, platform: null, changedAt: null, hour: 5, minute: 30 }),
    { enabled: false, platform: null, changedAt: null, hour: 5, minute: 30 },
    'a time picked while off is kept',
  );
  for (const bad of [
    { hour: 24, minute: 0 },
    { hour: 5, minute: 60 },
    { hour: -1, minute: 0 },
    { hour: 5.5, minute: 0 },
    { hour: '5', minute: 0 },
    { hour: 5 },
    { hour: 3, minute: 59 },
    { hour: 9, minute: 1 },
    { hour: 14, minute: 0 },
  ]) {
    const pref = sanitizeReminderPref({ enabled: true, platform: 'ios', ...bad });
    assert.deepEqual([pref.hour, pref.minute], [6, 0], `bad time ${JSON.stringify(bad)} falls back to 6:00`);
  }
  for (const edge of [{ hour: 4, minute: 0 }, { hour: 9, minute: 0 }]) {
    const pref = sanitizeReminderPref({ enabled: false, platform: null, ...edge });
    assert.deepEqual([pref.hour, pref.minute], [edge.hour, edge.minute], `${formatReminderTime(edge)} is kept`);
  }
  assert.equal(sanitizeReminderPref({ enabled: true, platform: 'windows' }).platform, null);
  assert.notEqual(reminderStorageKey('a'), reminderStorageKey('b'), 'each user has their own setting');
}

// ── Picking a time ────────────────────────────────────────────────────────

{
  assert.deepEqual(parseReminderTime('05:30'), { hour: 5, minute: 30 });
  assert.deepEqual(parseReminderTime('5:30'), { hour: 5, minute: 30 });
  assert.deepEqual(parseReminderTime('23:59'), { hour: 23, minute: 59 });
  assert.equal(parseReminderTime(''), null, 'cleared input');
  assert.equal(parseReminderTime('24:00'), null);
  assert.equal(parseReminderTime('06:60'), null);
  assert.equal(parseReminderTime('6am'), null);
  assert.equal(reminderTimeValue({ hour: 5, minute: 5 }), '05:05');
  assert.equal(reminderTimeValue(DEFAULT_REMINDER_TIME), '06:00');
  assert.equal(formatReminderTime({ hour: 5, minute: 30 }), '5:30 AM');
  assert.equal(formatReminderTime({ hour: 0, minute: 15 }), '12:15 AM');
  assert.equal(formatReminderTime({ hour: 12, minute: 0 }), '12:00 PM');
  assert.equal(formatReminderTime({ hour: 13, minute: 45 }), '1:45 PM');
  assert.equal(sameReminderTime({ hour: 6, minute: 0 }, { hour: 6, minute: 0 }), true);
  assert.equal(sameReminderTime({ hour: 6, minute: 0 }, { hour: 6, minute: 30 }), false);
}

// ── Allowed range: 4:00 AM through 9:00 AM ────────────────────────────────

{
  assert.deepEqual(REMINDER_EARLIEST, { hour: 4, minute: 0 });
  assert.deepEqual(REMINDER_LATEST, { hour: 9, minute: 0 });
  assert.equal(reminderTimeInRange({ hour: 4, minute: 0 }), true, '4:00 AM allowed');
  assert.equal(reminderTimeInRange({ hour: 9, minute: 0 }), true, '9:00 AM allowed (inclusive)');
  assert.equal(reminderTimeInRange({ hour: 6, minute: 30 }), true);
  assert.equal(reminderTimeInRange({ hour: 3, minute: 59 }), false, '3:59 AM refused');
  assert.equal(reminderTimeInRange({ hour: 9, minute: 1 }), false, '9:01 AM refused');
  assert.equal(reminderTimeInRange({ hour: 0, minute: 0 }), false);
  assert.equal(reminderTimeInRange({ hour: 21, minute: 0 }), false, '9:00 PM refused');
  assert.equal(reminderTimeInRange(DEFAULT_REMINDER_TIME), true, 'default is in range');
  assert.equal(REMINDER_RANGE_MESSAGE, 'Pick a time from 4:00 AM to 9:00 AM.');
  assert.equal(reminderFailureMessage('time-out-of-range'), REMINDER_RANGE_MESSAGE);
}

// ── Next ring ─────────────────────────────────────────────────────────────

{
  assert.equal(nextReminderAt(local(2, 5, 30)), local(2, 6), 'Monday before 6 → today');
  assert.equal(nextReminderAt(local(2, 6)), local(3, 6), 'exactly 6:00 → tomorrow');
  assert.equal(nextReminderAt(local(2, 14)), local(3, 6), 'Monday afternoon → Tuesday');
  assert.equal(nextReminderAt(local(6, 7)), local(9, 6), 'Friday after 6 → Monday');
  assert.equal(nextReminderAt(local(7, 5)), local(9, 6), 'Saturday → Monday');
  assert.equal(nextReminderAt(local(8, 23, 59)), local(9, 6), 'Sunday night → Monday');

  const early = { hour: 5, minute: 15 };
  assert.equal(nextReminderAt(local(2, 5), early), local(2, 5, 15), 'own time: Monday 5:00 → today 5:15');
  assert.equal(nextReminderAt(local(2, 5, 30), early), local(3, 5, 15), 'own time already passed → Tuesday');
  assert.equal(nextReminderAt(local(6, 6), early), local(9, 5, 15), 'Friday after → Monday');
  // 2026-11-11 (Veterans Day, a Wednesday) still rings: holidays included.
  assert.equal(nextReminderAt(local(10, 7)), local(11, 6), 'holidays are not skipped');
}

// ── Skip today when already clocked in ────────────────────────────────────

{
  assert.equal(shouldSkipTodaysReminder(local(2, 5, 45), true), true, 'clocked in at 5:45 Monday');
  assert.equal(shouldSkipTodaysReminder(local(2, 5, 45), false), false, 'not clocked in');
  assert.equal(shouldSkipTodaysReminder(local(2, 6, 10), true), false, 'already went off');
  assert.equal(shouldSkipTodaysReminder(local(7, 5, 0), true), false, 'Saturday has no reminder');
  assert.equal(shouldSkipTodaysReminder(local(2, 5, 45), true, { hour: 5, minute: 30 }), false, 'own 5:30 time already went off');
  assert.equal(shouldSkipTodaysReminder(local(2, 6, 10), true, { hour: 6, minute: 30 }), true, 'own 6:30 time still ahead');
}

// ── Messages ──────────────────────────────────────────────────────────────

{
  assert.match(reminderOnMessage('android'), /Clock app for 6:00 AM, Monday to Friday, holidays included, named "ITDG Dispatch clock in"/);
  assert.match(reminderOnMessage('android', { hour: 5, minute: 30 }), /Clock app for 5:30 AM/);
  assert.match(reminderOnMessage('ios'), /notification at 6:00 AM, Monday to Friday, holidays included/);
  assert.match(reminderOnMessage('ios', { hour: 6, minute: 45 }), /notification at 6:45 AM/);
  assert.match(reminderOnMessage('ios'), /can't add Clock alarms/);
  assert.match(
    reminderTimeChangedMessage('android', { hour: 6, minute: 0 }, { hour: 5, minute: 30 }),
    /New alarm set in your Clock app for 5:30 AM.*delete the old 6:00 AM "ITDG Dispatch clock in" alarm/,
    'Android: moving the time leaves the old alarm, so say to delete it',
  );
  assert.equal(
    reminderTimeChangedMessage('ios', { hour: 6, minute: 0 }, { hour: 5, minute: 30 }),
    reminderOnMessage('ios', { hour: 5, minute: 30 }),
    'iPhone replaces its notifications',
  );
  assert.equal(reminderOffMessage('ios', true), 'Reminder off.');
  assert.match(reminderOffMessage('android', false), /open Clock and delete the 6:00 AM "ITDG Dispatch clock in" alarm/);
  assert.match(reminderOffMessage('android', false, { hour: 5, minute: 30 }), /delete the 5:30 AM "ITDG Dispatch clock in" alarm/);

  assert.equal(reminderFailure({ code: 'UNIMPLEMENTED', message: 'x' }), 'not-implemented');
  assert.equal(reminderFailure(new Error('no-clock-app')), 'no-clock-app');
  assert.equal(reminderFailure(new Error('notifications-denied')), 'notifications-denied');
  assert.equal(reminderFailure(new Error('boom')), 'unknown');
  assert.match(reminderFailureMessage('web'), /phone app/);
  assert.match(reminderFailureMessage('notifications-denied'), /Notifications are off/);
  assert.match(reminderFailureMessage('not-implemented'), /Update ITDG Dispatch/);
  assert.match(reminderFailureMessage('no-clock-app'), /Set a 6:00 AM weekday alarm/);
  assert.match(reminderFailureMessage('no-clock-app', { hour: 5, minute: 30 }), /Set a 5:30 AM weekday alarm/);
}

console.log('clock-in reminder checks passed');
