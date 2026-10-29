import { useMemo, useState } from 'react';
import { Clock, MapPin } from 'lucide-react';
import type { Job } from '@/lib/data';
import { arrivalNotificationBody, jobSitesForArrival } from '@/lib/geofence/sites';
import {
  DEFAULT_WORK_HOURS,
  formatHourLabel,
  loadWorkHours,
  phoenixToday,
  saveWorkHours,
  type WorkHoursConfig,
} from '@/lib/geofence/workHours';
import {
  addTimePunch,
  formatPhoenixTime,
  loadTimePunches,
  punchesOnDay,
} from '@/lib/timeCard';

interface Props {
  jobs: Job[];
  focusJobId: string | null;
}

const START_HOURS = [5, 6, 7, 8] as const;
const END_HOURS = [14, 15, 16, 17, 18] as const;

export default function TimeCardView({ jobs, focusJobId }: Props) {
  const today = phoenixToday();
  const [hours, setHours] = useState<WorkHoursConfig>(() => loadWorkHours());
  const [punches, setPunches] = useState(() => loadTimePunches());
  const todayPunches = punchesOnDay(punches, today);

  const todaysJobs = useMemo(
    () => jobs.filter(job => {
      if (job.status === 'completed') return false;
      const end = job.endDate ?? job.date;
      return Boolean(job.date) && job.date <= today && end >= today;
    }),
    [jobs, today],
  );

  const focus = jobs.find(job => job.id === focusJobId) ?? null;
  const located = jobSitesForArrival(jobs, today);

  const clockIn = (job: Job) => {
    const next = addTimePunch({
      jobId: job.id,
      jobName: job.customerName || 'Job site',
      at: new Date().toISOString(),
    });
    setPunches(next);
  };

  const updateHours = (patch: Partial<WorkHoursConfig>) => {
    const next = saveWorkHours({ ...hours, ...patch, timeZone: 'America/Phoenix' });
    setHours(next);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300">
          <Clock className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Time card</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Clock-ins stay on this phone. They are not sent to the office until a time-card table is added.
          {located.length === 0
            ? ' No job sites have coordinates yet, so arrival detection stays quiet.'
            : ` ${located.length} job site${located.length === 1 ? '' : 's'} can trigger an arrival reminder today.`}
        </p>
        {focus && (
          <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900 dark:bg-teal-950 dark:text-teal-100">
            {arrivalNotificationBody(focus.customerName)}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Today’s jobs</h3>
        {todaysJobs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing scheduled for today.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {todaysJobs.map(job => {
              const punched = todayPunches.find(punch => punch.jobId === job.id);
              return (
                <li
                  key={job.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{job.customerName}</p>
                    <p className="text-xs text-slate-500">{job.address}</p>
                    {punched && (
                      <p className="mt-1 text-xs font-medium text-teal-700 dark:text-teal-300">
                        Clocked in at {formatPhoenixTime(new Date(punched.at))} Phoenix
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => clockIn(job)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                  >
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Clock in
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Arrival hours</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          The phone watches job sites only inside this window (Phoenix time). Default is {formatHourLabel(DEFAULT_WORK_HOURS.startHour)} to {formatHourLabel(DEFAULT_WORK_HOURS.endHour)}, weekdays.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-500">
            Start
            <select
              aria-label="Arrival start hour"
              value={hours.startHour}
              onChange={event => updateHours({ startHour: Number(event.target.value) })}
              className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {START_HOURS.map(hour => (
                <option key={hour} value={hour}>{formatHourLabel(hour)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            End
            <select
              aria-label="Arrival end hour"
              value={hours.endHour}
              onChange={event => updateHours({ endHour: Number(event.target.value) })}
              className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {END_HOURS.map(hour => (
                <option key={hour} value={hour}>{formatHourLabel(hour)}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={hours.weekdaysOnly}
              onChange={event => updateHours({ weekdaysOnly: event.target.checked })}
            />
            Weekdays only
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          In a browser tab, location is checked about once a minute while the tab is open. Background alerts need the Android or iOS app.
        </p>
      </section>
    </div>
  );
}
