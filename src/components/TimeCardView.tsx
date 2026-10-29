import { useState } from 'react';
import { Clock, Loader2, MapPin } from 'lucide-react';
import { clampRadius } from '@/lib/geofence/sites';
import { DEFAULT_WORK_HOURS, formatHourLabel } from '@/lib/geofence/workHours';
import { segmentMinutes } from '@/lib/shift/machine';
import type { ShopLocation, TimeSegment } from '@/lib/shift/types';
import type { ShiftTracker } from '@/hooks/useShiftTracker';

interface Props {
  tracker: ShiftTracker;
}

const START_HOURS = [5, 6, 7, 8] as const;
const END_HOURS = [14, 15, 16, 17, 18] as const;

function formatMinutes(minutes: number): string {
  if (minutes < 1) return '<1 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}

function segmentLabel(segment: TimeSegment): string {
  if (segment.kind === 'driving') return 'Travel';
  if (segment.kind === 'shop') return 'Shop';
  return `On site · ${segment.jobName || 'Job'}`;
}

export default function TimeCardView({ tracker }: Props) {
  const [draft, setDraft] = useState<ShopLocation>(() => tracker.shop ?? {
    id: crypto.randomUUID(),
    name: 'Shop',
    latitude: 32.2226,
    longitude: -110.9747,
    radiusMeters: 90,
  });
  const now = Date.now();
  const travel = tracker.segments
    .filter(segment => segment.kind === 'driving')
    .reduce((sum, segment) => sum + segmentMinutes(segment, now), 0);
  const onSite = tracker.segments
    .filter(segment => segment.kind !== 'driving')
    .reduce((sum, segment) => sum + segmentMinutes(segment, now), 0);

  const saveDraft = () => {
    tracker.saveShop({
      ...draft,
      name: draft.name.trim() || 'Shop',
      radiusMeters: clampRadius(draft.radiusMeters),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300">
          <Clock className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Time card</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Clock in once at the shop. Shop time, travel, and time on each job switch by themselves until you clock out.
          Travel stays separate from on-site time.
        </p>
        <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">
          Travel {formatMinutes(travel)} · On site {formatMinutes(onSite)}
        </p>
        {tracker.notice && (
          <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {tracker.notice}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          {tracker.syncStatus === 'synced'
            ? 'Time entries are synced.'
            : tracker.syncStatus === 'offline'
              ? 'Offline. Segments stay on this phone and sync when service returns.'
              : 'Saved on this phone. Sync retries until the server accepts them.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {tracker.tracking ? (
            <button
              type="button"
              onClick={tracker.clockOut}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Clock out
            </button>
          ) : (
            <button
              type="button"
              onClick={tracker.requestStart}
              disabled={tracker.starting}
              aria-busy={tracker.starting}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {tracker.starting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {tracker.starting ? 'Getting your location…' : 'Start shift'}
            </button>
          )}
          {tracker.starting && (
            <button
              type="button"
              onClick={tracker.cancelStart}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">This shift</h3>
        {tracker.segments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No segments yet. Start at the shop and the rest fills in.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tracker.segments.map(segment => (
              <li
                key={segment.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
              >
                <span className="font-semibold text-slate-900 dark:text-white">{segmentLabel(segment)}</span>
                <span className="text-slate-500">{formatMinutes(segmentMinutes(segment, now))}{segment.endedAt ? '' : ' · now'}</span>
              </li>
            ))}
          </ul>
        )}
        {tracker.shift?.batteryStart != null && (
          <p className="mt-3 text-xs text-slate-500">
            Battery at clock-in {tracker.shift.batteryStart}%
            {tracker.shift.batteryEnd != null ? ` · at clock-out ${tracker.shift.batteryEnd}%` : ''}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Shop
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-500">
            Name
            <input
              aria-label="Shop name"
              value={draft.name}
              onChange={event => setDraft({ ...draft, name: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Radius (meters)
            <input
              aria-label="Shop radius meters"
              type="number"
              min={30}
              max={200}
              value={draft.radiusMeters}
              onChange={event => setDraft({ ...draft, radiusMeters: Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Latitude
            <input
              aria-label="Shop latitude"
              type="number"
              step="0.0001"
              value={draft.latitude}
              onChange={event => setDraft({ ...draft, latitude: Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Longitude
            <input
              aria-label="Shop longitude"
              type="number"
              step="0.0001"
              value={draft.longitude}
              onChange={event => setDraft({ ...draft, longitude: Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={saveDraft}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          Save shop
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Safety stop</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Tracking runs from clock-in until clock-out. If a shift is still open at the end of this window, it closes on its own. Default is {formatHourLabel(DEFAULT_WORK_HOURS.startHour)} to {formatHourLabel(DEFAULT_WORK_HOURS.endHour)}, weekdays, Phoenix time.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <HourSelect
            label="Window start"
            ariaLabel="Safety window start"
            value={tracker.safety.startHour}
            hours={START_HOURS}
            onChange={startHour => tracker.saveSafety({ startHour })}
          />
          <HourSelect
            label="Safety stop"
            ariaLabel="Safety stop hour"
            value={tracker.safety.endHour}
            hours={END_HOURS}
            onChange={endHour => tracker.saveSafety({ endHour })}
          />
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={tracker.safety.weekdaysOnly}
              onChange={event => tracker.saveSafety({ weekdaysOnly: event.target.checked })}
            />
            Weekdays only
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="text-xs font-semibold text-slate-500">
            Job dwell
            <select
              aria-label="Job dwell minutes"
              value={tracker.dwellMinutes}
              onChange={event => tracker.saveDwellMinutes(Number(event.target.value))}
              className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value={3}>3 min</option>
              <option value={4}>4 min</option>
              <option value={5}>5 min</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Driving speed
            <select
              aria-label="Driving speed mph"
              value={tracker.speedMph}
              onChange={event => tracker.saveSpeed(Number(event.target.value))}
              className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {[8, 10, 12, 15].map(mph => (
                <option key={mph} value={mph}>{mph} mph</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {tracker.consentOpen && (
        <div
          role="dialog"
          aria-labelledby="shift-consent-title"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <h2 id="shift-consent-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Location while clocked in
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Location is recorded only while you are clocked in. The phone saves shop time, travel time, and time at each job so the time card fills in without extra taps. It stops when you clock out. If you forget, it also stops at the safety time (default 5:00 PM Phoenix time on weekdays). High-accuracy GPS runs while you are moving. While you are stopped it uses the lower-power shop and job fences.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={tracker.dismissConsent}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={tracker.acceptConsentAndStart}
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Start tracking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HourSelect({
  label,
  ariaLabel,
  value,
  hours,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  hours: readonly number[];
  onChange: (hour: number) => void;
}) {
  return (
    <label className="text-xs font-semibold text-slate-500">
      {label}
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      >
        {hours.map(hour => (
          <option key={hour} value={hour}>{formatHourLabel(hour)}</option>
        ))}
      </select>
    </label>
  );
}
