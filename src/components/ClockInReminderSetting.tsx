import React, { useEffect, useState } from 'react';
import { AlarmClock, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { nativeDispatchPlatform } from '@/lib/geofence/nativeClient';
import {
  REMINDER_EARLIEST,
  REMINDER_LATEST,
  REMINDER_RANGE_MESSAGE,
  formatReminderTime,
  parseReminderTime,
  reminderTimeInRange,
  reminderFailureMessage,
  reminderOffMessage,
  reminderOnMessage,
  reminderTimeChangedMessage,
  reminderTimeValue,
  sameReminderTime,
  type ReminderPref,
} from '@/lib/shift/clockInReminder';
import {
  disableClockInReminder,
  enableClockInReminder,
  loadReminderPref,
  openClockAlarms,
  saveReminderTime,
} from '@/lib/shift/reminderNative';

/**
 * Opt-in weekday clock-in reminder at a time each person picks between 4:00
 * and 9:00 AM (6:00 AM by default). Off by default, per user, per phone.
 */
const ClockInReminderSetting: React.FC = () => {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const platform = nativeDispatchPlatform();
  const [pref, setPref] = useState<ReminderPref>(() => loadReminderPref(userId));
  const [draft, setDraft] = useState(() => reminderTimeValue(pref));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showOpenClock, setShowOpenClock] = useState(false);

  useEffect(() => {
    const loaded = loadReminderPref(userId);
    setPref(loaded);
    setDraft(reminderTimeValue(loaded));
  }, [userId]);

  const parsedDraft = parseReminderTime(draft);
  const outOfRange = parsedDraft != null && !reminderTimeInRange(parsedDraft);
  const draftTime = outOfRange ? null : parsedDraft;
  const timeChanged = draftTime != null && !sameReminderTime(draftTime, pref);

  const toggle = async (next: boolean) => {
    if (!userId || busy) return;
    setBusy(true);
    setMessage(null);
    setShowOpenClock(false);
    try {
      if (next) {
        if (outOfRange) {
          setMessage(REMINDER_RANGE_MESSAGE);
          return;
        }
        const result = await enableClockInReminder(userId, draftTime ?? pref);
        if (result.ok === false) {
          setMessage(reminderFailureMessage(result.reason, draftTime ?? pref));
          return;
        }
        setPref(result.pref);
        setDraft(reminderTimeValue(result.pref));
        setMessage(reminderOnMessage(result.platform, result.pref));
      } else {
        const result = await disableClockInReminder(userId, pref.platform);
        if (result.ok === false) {
          setPref(loadReminderPref(userId));
          setMessage(reminderFailureMessage(result.reason, pref));
          return;
        }
        setPref(result.pref);
        setMessage(reminderOffMessage(result.platform, result.removed, result.pref));
        setShowOpenClock(result.platform === 'android' && !result.removed);
      }
    } finally {
      setBusy(false);
    }
  };

  const saveTime = async () => {
    if (!userId || busy || !draftTime) return;
    setMessage(null);
    setShowOpenClock(false);
    if (!pref.enabled) {
      setPref(saveReminderTime(userId, draftTime));
      setMessage(`Reminder time saved: ${formatReminderTime(draftTime)}. Turn the reminder on to set it.`);
      return;
    }
    setBusy(true);
    try {
      const result = await enableClockInReminder(userId, draftTime);
      if (result.ok === false) {
        setMessage(reminderFailureMessage(result.reason, draftTime));
        return;
      }
      setPref(result.pref);
      if (result.leftBehind) {
        setMessage(reminderTimeChangedMessage(result.platform, result.leftBehind, result.pref));
        setShowOpenClock(true);
      } else {
        setMessage(reminderOnMessage(result.platform, result.pref));
      }
    } finally {
      setBusy(false);
    }
  };

  const at = formatReminderTime(pref);
  const description = platform === 'android'
    ? `Adds a ${at} Monday–Friday alarm to your phone's Clock app. Rings on holidays too.`
    : platform === 'ios'
      ? `Sends a notification at ${at} Monday–Friday, holidays included. iPhone apps can't set Clock alarms. Skipped if you already clocked in.`
      : 'Available in the ITDG Dispatch phone app.';

  return (
    <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-medium text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
            <AlarmClock className="w-4 h-4 text-teal-600" /> Clock-in reminder
          </div>
          <div className="text-xs text-slate-500">{description}</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin text-slate-400" />}
          <input
            type="checkbox"
            aria-label="Clock-in reminder"
            className="sr-only peer"
            checked={pref.enabled}
            disabled={busy || !userId || (!platform && !pref.enabled)}
            onChange={e => { void toggle(e.target.checked); }}
          />
          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 dark:peer-focus:ring-teal-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-teal-600 peer-disabled:opacity-50" />
        </label>
      </div>
      {platform && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            Time
            <input
              type="time"
              step={60}
              min={reminderTimeValue(REMINDER_EARLIEST)}
              max={reminderTimeValue(REMINDER_LATEST)}
              aria-label="Reminder time"
              aria-invalid={outOfRange || undefined}
              value={draft}
              disabled={busy || !userId}
              onChange={e => setDraft(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
          {timeChanged && (
            <button
              type="button"
              disabled={busy}
              onClick={() => { void saveTime(); }}
              className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              Save time
            </button>
          )}
          {outOfRange && (
            <span role="alert" className="text-xs font-semibold text-amber-700 dark:text-amber-300">{REMINDER_RANGE_MESSAGE}</span>
          )}
        </div>
      )}
      {message && (
        <div className="mt-3 text-xs text-slate-700 dark:text-slate-300">
          <p role="status">{message}</p>
          {showOpenClock && (
            <button
              type="button"
              onClick={() => { void openClockAlarms(); }}
              className="mt-2 rounded-lg border border-teal-600 px-3 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950"
            >
              Open Clock alarms
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ClockInReminderSetting;
