import { MapPin } from 'lucide-react';
import { arrivalNotificationBody } from '@/lib/geofence/sites';
import type { ArrivalPrompt as ArrivalPromptState, ArrivalWatch } from '@/hooks/useJobSiteArrival';

interface Props {
  prompt: ArrivalPromptState | null;
  watch: ArrivalWatch;
  onAllow: () => void;
  onDismiss: (jobId?: string) => void;
  onOpenTimeCard: (jobId: string) => void;
}

export default function ArrivalPrompt({
  prompt,
  watch,
  onAllow,
  onDismiss,
  onOpenTimeCard,
}: Props) {
  return (
    <>
      <p className="sr-only" data-arrival-watch={watch}>
        {watch}
      </p>
      {prompt ? <ArrivalCard prompt={prompt} onAllow={onAllow} onDismiss={onDismiss} onOpenTimeCard={onOpenTimeCard} /> : null}
    </>
  );
}

function ArrivalCard({
  prompt,
  onAllow,
  onDismiss,
  onOpenTimeCard,
}: {
  prompt: ArrivalPromptState;
  onAllow: () => void;
  onDismiss: (jobId?: string) => void;
  onOpenTimeCard: (jobId: string) => void;
}) {
  switch (prompt.kind) {
    case 'permission':
      return (
        <div
          role="dialog"
          aria-labelledby="arrival-permission-title"
          aria-modal="false"
          className="fixed bottom-4 left-4 right-4 z-[70] mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" aria-hidden="true" />
            <div>
              <h2 id="arrival-permission-title" className="text-sm font-bold text-slate-900 dark:text-white">
                Arrive at a job site
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Allow location while this app is open so we can tell when you arrive at a job site and remind you to update your time card. Checks run on weekdays from 6:00 AM to 4:00 PM Phoenix time and stop outside those hours. The phone app can also watch in the background during those hours.
              </p>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onDismiss()}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={onAllow}
              className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Allow location
            </button>
          </div>
        </div>
      );
    case 'denied':
      return (
        <div
          role="dialog"
          aria-labelledby="arrival-denied-title"
          aria-modal="false"
          className="fixed bottom-4 left-4 right-4 z-[70] mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-xl dark:border-amber-800 dark:bg-amber-950"
        >
          <h2 id="arrival-denied-title" className="text-sm font-bold text-amber-900 dark:text-amber-200">
            Location is off
          </h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Arrival reminders stay quiet until location is allowed for this app.
          </p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => onDismiss()}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900"
            >
              OK
            </button>
          </div>
        </div>
      );
    case 'arrival':
      return (
        <div
          role="dialog"
          aria-labelledby="arrival-title"
          aria-modal="false"
          className="fixed bottom-4 left-4 right-4 z-[70] mx-auto max-w-md rounded-2xl border border-teal-200 bg-white p-4 shadow-xl dark:border-teal-800 dark:bg-slate-900"
        >
          <h2 id="arrival-title" className="text-sm font-bold text-slate-900 dark:text-white">
            Job site arrival
          </h2>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
            {arrivalNotificationBody(prompt.jobName)}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onDismiss(prompt.jobId)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => onOpenTimeCard(prompt.jobId)}
              className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Update time card
            </button>
          </div>
        </div>
      );
    default: {
      const unreachable: never = prompt;
      return unreachable;
    }
  }
}
