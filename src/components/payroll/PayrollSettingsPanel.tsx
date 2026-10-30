import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { savePayrollSettings, type PayrollSettingsRow } from '@/lib/payroll/data';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const inputClass =
  'mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white';

export default function PayrollSettingsPanel({
  userId,
  row,
  onSaved,
}: {
  userId: string;
  row: PayrollSettingsRow;
  onSaved: (row: PayrollSettingsRow) => void;
}) {
  const [draft, setDraft] = useState<PayrollSettingsRow>(row);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (next: Partial<PayrollSettingsRow>) => setDraft(current => ({ ...current, ...next }));

  const save = async () => {
    if (draft.lunch_end <= draft.lunch_start) {
      setError('Lunch must end after it starts.');
      return;
    }
    setSaving(true);
    setError(null);
    const outcome = await savePayrollSettings(userId, draft);
    setSaving(false);
    if (outcome.ok === false) {
      setError(outcome.message);
      return;
    }
    onSaved(draft);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Payroll settings</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-500">Automatic lunch (Phoenix time)</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={draft.lunch_enabled} onChange={e => patch({ lunch_enabled: e.target.checked })} />
            Insert lunch every shift day
          </label>
          <div className="flex gap-2">
            <label className="text-xs font-semibold text-slate-500">Start
              <input type="time" value={draft.lunch_start} onChange={e => patch({ lunch_start: e.target.value })} className={inputClass} />
            </label>
            <label className="text-xs font-semibold text-slate-500">End
              <input type="time" value={draft.lunch_end} onChange={e => patch({ lunch_end: e.target.value })} className={inputClass} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={draft.lunch_paid} onChange={e => patch({ lunch_paid: e.target.checked })} />
            Lunch is paid
          </label>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-500">Pay week</legend>
          <label className="text-xs font-semibold text-slate-500">Week starts
            <select value={draft.week_start_dow} onChange={e => patch({ week_start_dow: Number(e.target.value) })} className={inputClass}>
              {DOW.map((name, index) => <option key={name} value={index}>{name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">Overtime after (hours / week)
            <input
              type="number"
              min={1}
              max={168}
              step={0.5}
              value={draft.overtime_weekly_hours}
              onChange={e => patch({ overtime_weekly_hours: Number(e.target.value) })}
              className={inputClass}
            />
          </label>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-500">Flags</legend>
          <label className="text-xs font-semibold text-slate-500">Flag travel longer than (minutes)
            <input
              type="number"
              min={5}
              max={1440}
              value={draft.travel_alert_minutes}
              onChange={e => patch({ travel_alert_minutes: Number(e.target.value) })}
              className={inputClass}
            />
          </label>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-500">Daily owner summary (SMS)</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={draft.daily_summary_enabled}
              onChange={e => patch({ daily_summary_enabled: e.target.checked })}
            />
            Send each evening
          </label>
          <label className="text-xs font-semibold text-slate-500">Owner phone
            <input
              type="tel"
              placeholder="+15205551234"
              value={draft.daily_summary_phone ?? ''}
              onChange={e => patch({ daily_summary_phone: e.target.value })}
              className={inputClass}
            />
          </label>
          <p className="text-xs text-slate-500">
            Off by default. Also needs the payroll-daily-summary function deployed and scheduled.
          </p>
        </fieldset>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <button
        type="button"
        onClick={() => { void save(); }}
        disabled={saving}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save settings
      </button>
    </section>
  );
}
