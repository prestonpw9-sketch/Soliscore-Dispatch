import { useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import type { Job } from '@/lib/data';
import {
  jobPinState,
  parseLatLng,
  saveAddressAndGeocode,
  saveManualJobPin,
  type PinState,
} from '@/lib/jobGeocode';
import { useBackHandler } from '@/lib/nav/backStack';

const PIN_LABEL: Record<PinState, string> = {
  pinned: 'Pinned',
  stale: 'Check pin',
  pending: 'Locating…',
  failed: 'Unpinned',
  no_address: 'No address',
};

const PIN_CLASS: Record<PinState, string> = {
  pinned: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-400/20 dark:text-emerald-100 dark:border-emerald-300/40',
  stale: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-400/25 dark:text-amber-50 dark:border-amber-300/40',
  pending: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-200 dark:border-white/15',
  failed: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-500/25 dark:text-rose-50 dark:border-rose-300/40',
  no_address: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-500/25 dark:text-rose-50 dark:border-rose-300/40',
};

function pinTitle(job: Job, state: PinState): string {
  if (state === 'pinned') {
    const where = job.geocodedAddress ? ` Matched: ${job.geocodedAddress}.` : '';
    return `Arrival pin ${job.latitude?.toFixed(5)}, ${job.longitude?.toFixed(5)}.${where}`;
  }
  if (state === 'stale') return 'The address changed after this job was pinned. The old pin is still in use.';
  if (state === 'pending') return 'Looking up the address. Crew arrival is not detected until the job is pinned.';
  if (state === 'no_address') return 'No street address. Crew arrival is not detected until the job is pinned.';
  return 'The address lookup found no match. Crew arrival is not detected until the job is pinned.';
}

export function JobPinBadge({
  job,
  onFix,
}: {
  job: Job;
  onFix?: () => void;
}) {
  // Before the geocode migration there is nothing to show.
  if (job.geocodeStatus === undefined && job.latitude == null) return null;
  const state = jobPinState(job);
  return (
    <span className="inline-flex items-center gap-1.5">
      {/* A pinned badge is also the way to correct a wrong pin. */}
      <button
        type="button"
        title={pinTitle(job, state)}
        disabled={!onFix}
        onClick={e => { e.stopPropagation(); onFix?.(); }}
        onKeyDown={e => e.stopPropagation()}
        aria-label={`${PIN_LABEL[state]}. ${pinTitle(job, state)}`}
        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border disabled:cursor-default ${PIN_CLASS[state]}`}
      >
        <MapPin className="w-3 h-3" aria-hidden="true" />
        {PIN_LABEL[state]}
      </button>
      {onFix && state !== 'pinned' && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onFix(); }}
          onKeyDown={e => e.stopPropagation()}
          className="text-[11px] font-bold text-teal-700 hover:text-teal-600 dark:text-teal-300 underline underline-offset-2"
        >
          Fix location
        </button>
      )}
    </span>
  );
}

export default function JobLocationFix({
  job,
  onClose,
  onSaved,
}: {
  job: Job;
  onClose: () => void;
  onSaved: () => void;
}) {
  useBackHandler(true, onClose);
  const [address, setAddress] = useState(job.address ?? '');
  const [coords, setCoords] = useState('');
  const [busy, setBusy] = useState<'address' | 'coords' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const saveAddress = async () => {
    setBusy('address');
    setMessage(null);
    const saved = await saveAddressAndGeocode(job.id, address);
    setBusy(null);
    if (saved.ok === false) {
      setMessage(saved.message);
      return;
    }
    onSaved();
    const result = saved.outcome?.result;
    if (result === 'pinned') {
      onClose();
      return;
    }
    if (result === 'failed' || result === 'no_address') {
      setMessage(`Address saved, but the lookup found no match. ${saved.outcome?.message ?? ''} Paste coordinates below instead.`.trim());
    } else if (!saved.outcome) {
      setMessage('Address saved. The lookup did not answer; try again or paste coordinates below.');
    } else {
      setMessage('Address saved.');
    }
  };

  const saveCoords = async () => {
    const parsed = parseLatLng(coords);
    if (!parsed) {
      setMessage('Paste latitude, longitude — for example 32.2226, -110.9747.');
      return;
    }
    setBusy('coords');
    setMessage(null);
    const saved = await saveManualJobPin(job.id, parsed.latitude, parsed.longitude);
    setBusy(null);
    if (saved.ok === false) {
      setMessage(saved.message);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fix-location-title"
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <h2 id="fix-location-title" className="text-lg font-bold text-slate-900 dark:text-white">
            Fix location · {job.customerName || 'Job'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Crew arrival is detected only on pinned jobs.
        </p>

        <label className="mt-4 block text-xs font-semibold text-slate-500">
          Street address
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="123 E Main St, Tucson, AZ 85701"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </label>
        <button
          type="button"
          onClick={() => { void saveAddress(); }}
          disabled={busy !== null}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {busy === 'address' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Save address and look up
        </button>

        <label className="mt-5 block text-xs font-semibold text-slate-500">
          Or paste coordinates (lat, lng)
          <input
            value={coords}
            onChange={e => setCoords(e.target.value)}
            placeholder="32.2226, -110.9747"
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </label>
        <button
          type="button"
          onClick={() => { void saveCoords(); }}
          disabled={busy !== null}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {busy === 'coords' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Save pin
        </button>

        {message && (
          <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
