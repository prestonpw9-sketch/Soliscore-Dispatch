import { Suspense, lazy, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
import type { Job } from '@/lib/data';
import {
  deleteSegment,
  editSegment,
  editShift,
  formatHours,
  formatPhoenixClock,
  insertSegment,
  isoToPhoenixHhmm,
  phoenixLocalToIso,
  type PayrollAuditRow,
  type PayrollDay,
  type PayrollSegmentKind,
  type PayrollSegmentView,
} from '@/lib/payroll/data';

const PayrollDayMap = lazy(() => import('./PayrollDayMap'));

interface Props {
  day: PayrollDay;
  jobs: Job[];
  names: Record<string, string>;
  audit: PayrollAuditRow[];
  onChanged: (message: string) => Promise<void>;
}

const KIND_LABEL: Record<PayrollSegmentKind, string> = {
  shop: 'Shop',
  driving: 'Travel',
  job: 'On site',
  lunch: 'Lunch',
};

const inputClass =
  'rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white';

type Outcome = { ok: true } | { ok: false; message: string };

function summarize(value: Record<string, unknown> | null): string {
  if (!value) return '—';
  const kind = typeof value.kind === 'string' ? KIND_LABEL[value.kind as PayrollSegmentKind] ?? value.kind : null;
  const start = typeof value.started_at === 'string' ? formatPhoenixClock(value.started_at) : '—';
  const end = typeof value.ended_at === 'string' ? formatPhoenixClock(value.ended_at) : 'open';
  const job = typeof value.job_name === 'string' && value.kind === 'job' ? ` · ${value.job_name}` : '';
  return kind ? `${kind}${job} ${start}–${end}` : `${start}–${end}`;
}

export default function PayrollDayDetail({ day, jobs, names, audit, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const jobOptions = useMemo(() => {
    const used = new Set(day.segments.map(segment => String(segment.job_id ?? '')));
    return jobs
      .filter(job => job.status !== 'completed' || used.has(job.id) || (job.date <= day.workDate && (job.endDate ?? job.date) >= day.workDate))
      .map(job => ({ id: job.id, label: `${job.customerName || 'Job'} — ${job.address || ''}`.trim() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [jobs, day.segments, day.workDate]);

  const act = async (key: string, action: () => Promise<Outcome>, message: string) => {
    setBusy(key);
    setError(null);
    const outcome = await action();
    setBusy(null);
    if (outcome.ok === false) {
      setError(outcome.message);
      return;
    }
    await onChanged(message);
  };

  const openShift = day.shifts.some(shift => !shift.clockOut);

  return (
    <div className="space-y-4">
      {day.anomalies.length > 0 && (
        <ul className="space-y-1">
          {day.anomalies.map((anomaly, index) => (
            <li
              key={`${anomaly.kind}-${index}`}
              className={`flex items-start gap-2 text-sm ${anomaly.resolved ? 'text-slate-500' : 'text-amber-900 dark:text-amber-100'}`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {anomaly.message}
            </li>
          ))}
        </ul>
      )}

      {day.jobs.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">By job</h4>
          <table className="mt-1 text-sm">
            <tbody>
              {day.jobs.map(job => (
                <tr key={job.key}>
                  <td className="pr-4 text-slate-900 dark:text-white">
                    {job.jobName}
                    {job.pinned === false && <span className="ml-2 text-xs font-bold text-rose-700 dark:text-rose-300">unpinned</span>}
                  </td>
                  <td className="pr-4 tabular-nums text-slate-600 dark:text-slate-300">travel {formatHours(job.travelMinutes)} h</td>
                  <td className="tabular-nums text-slate-600 dark:text-slate-300">on site {formatHours(job.onsiteMinutes)} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Clock in / out</h4>
        {day.shifts.map(shift => (
          <ShiftEditor
            key={shift.id}
            workDate={day.workDate}
            clockIn={shift.clockIn}
            clockOut={shift.clockOut}
            busy={busy === shift.id}
            onSave={(startedAt, endedAt, note) => act(
              shift.id,
              () => editShift({ shiftId: shift.id, startedAt, endedAt, note }),
              'Clock times saved.',
            )}
          />
        ))}
      </div>

      <MapSection workDate={day.workDate} segments={day.segments} jobs={jobs} />

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Segments</h4>
        {openShift && (
          <p className="mt-1 text-xs text-slate-500">
            A shift that is still open on the phone can only get a clock-out time. Segments unlock after that.
          </p>
        )}
        <ul className="mt-1 space-y-1.5">
          {day.segments.map(segment => (
            <SegmentEditor
              key={segment.id}
              segment={segment}
              workDate={day.workDate}
              jobOptions={jobOptions}
              locked={openShift}
              busy={busy === segment.id}
              onSave={patch => act(segment.id, () => editSegment({ segmentId: segment.id, ...patch }), 'Segment saved.')}
              onDelete={note => act(segment.id, () => deleteSegment(segment.id, note), 'Segment removed.')}
            />
          ))}
        </ul>
        {!openShift && day.shifts[0] && (
          <AddSegment
            workDate={day.workDate}
            jobOptions={jobOptions}
            busy={busy === 'add'}
            onAdd={args => act('add', () => insertSegment({ shiftId: day.shifts[day.shifts.length - 1].id, ...args }), 'Segment added.')}
          />
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-100">{error}</p>
      )}

      {audit.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Edit history</h4>
          <ul className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {audit.map(row => (
              <li key={row.id}>
                {new Date(row.edited_at).toLocaleString('en-US', { timeZone: 'America/Phoenix' })}
                {' · '}{names[row.edited_by ?? ''] ?? 'Owner'}
                {' · '}{row.action === 'insert' ? 'added' : row.action === 'delete' ? 'removed' : 'changed'}
                {' '}{row.target_table === 'shifts' ? 'clock times' : 'segment'}:
                {' '}<span className="line-through opacity-70">{summarize(row.original_value)}</span>
                {' → '}{summarize(row.new_value)}
                {row.note ? ` (“${row.note}”)` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ShiftEditor({
  workDate,
  clockIn,
  clockOut,
  busy,
  onSave,
}: {
  workDate: string;
  clockIn: string;
  clockOut: string | null;
  busy: boolean;
  onSave: (startedAt: string, endedAt: string | undefined, note: string) => Promise<void>;
}) {
  const [start, setStart] = useState(isoToPhoenixHhmm(clockIn));
  const [end, setEnd] = useState(isoToPhoenixHhmm(clockOut));
  const [note, setNote] = useState('');
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-1">In
        <input type="time" value={start} onChange={e => setStart(e.target.value)} className={inputClass} />
      </label>
      <label className="flex items-center gap-1">Out
        <input type="time" value={end} onChange={e => setEnd(e.target.value)} className={inputClass} />
      </label>
      <input placeholder="Reason (optional)" value={note} onChange={e => setNote(e.target.value)} className={`${inputClass} w-48`} />
      <button
        type="button"
        disabled={busy || !start}
        onClick={() => { void onSave(phoenixLocalToIso(workDate, start), end ? phoenixLocalToIso(workDate, end) : undefined, note); }}
        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />} Save clock times
      </button>
    </div>
  );
}

function SegmentEditor({
  segment,
  workDate,
  jobOptions,
  locked,
  busy,
  onSave,
  onDelete,
}: {
  segment: PayrollSegmentView;
  workDate: string;
  jobOptions: Array<{ id: string; label: string }>;
  locked: boolean;
  busy: boolean;
  onSave: (patch: {
    kind: PayrollSegmentKind;
    jobId: number | null;
    clearJob: boolean;
    startedAt: string;
    endedAt?: string;
    note: string;
  }) => Promise<void>;
  onDelete: (note: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<PayrollSegmentKind>(segment.kind);
  const [jobId, setJobId] = useState(segment.job_id != null ? String(segment.job_id) : '');
  const [start, setStart] = useState(isoToPhoenixHhmm(segment.started_at));
  const [end, setEnd] = useState(isoToPhoenixHhmm(segment.ended_at));
  const [note, setNote] = useState('');
  const dirty = kind !== segment.kind
    || jobId !== (segment.job_id != null ? String(segment.job_id) : '')
    || start !== isoToPhoenixHhmm(segment.started_at)
    || end !== isoToPhoenixHhmm(segment.ended_at);
  const missingJob = jobId && !jobOptions.some(option => option.id === jobId);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900">
      <select
        aria-label="Segment kind"
        value={kind}
        disabled={locked}
        onChange={e => setKind(e.target.value as PayrollSegmentKind)}
        className={inputClass}
      >
        {(Object.keys(KIND_LABEL) as PayrollSegmentKind[]).map(value => (
          <option key={value} value={value}>{KIND_LABEL[value]}</option>
        ))}
      </select>
      {kind === 'job' && (
        <select
          aria-label="Job"
          value={jobId}
          disabled={locked}
          onChange={e => setJobId(e.target.value)}
          className={`${inputClass} max-w-[16rem]`}
        >
          <option value="">{segment.job_name ?? 'Choose job'}</option>
          {missingJob && <option value={jobId}>{segment.job_name ?? `Job ${jobId}`}</option>}
          {jobOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      )}
      <input type="time" aria-label="Start" value={start} disabled={locked} onChange={e => setStart(e.target.value)} className={inputClass} />
      <span>–</span>
      <input type="time" aria-label="End" value={end} disabled={locked} onChange={e => setEnd(e.target.value)} className={inputClass} />
      <span className="tabular-nums text-slate-500">{formatHours(segment.minutes)} h</span>
      {segment.owner_edited_at && <span className="text-[10px] font-bold uppercase text-sky-700 dark:text-sky-300">edited</span>}
      {!locked && (
        <>
          <input placeholder="Reason" value={note} onChange={e => setNote(e.target.value)} className={`${inputClass} w-32`} />
          <button
            type="button"
            disabled={busy || !dirty || !start}
            onClick={() => {
              void onSave({
                kind,
                jobId: kind === 'job' && jobId ? Number(jobId) : null,
                clearJob: kind !== 'job' || !jobId,
                startedAt: phoenixLocalToIso(workDate, start),
                endedAt: end ? phoenixLocalToIso(workDate, end) : undefined,
                note,
              });
            }}
            className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
          </button>
          <button
            type="button"
            aria-label="Remove segment"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Remove this segment? The original stays in the edit history.')) void onDelete(note);
            }}
            className="rounded-lg p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-slate-800"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </li>
  );
}

function AddSegment({
  workDate,
  jobOptions,
  busy,
  onAdd,
}: {
  workDate: string;
  jobOptions: Array<{ id: string; label: string }>;
  busy: boolean;
  onAdd: (args: { kind: PayrollSegmentKind; startedAt: string; endedAt: string; jobId: number | null; note: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PayrollSegmentKind>('job');
  const [jobId, setJobId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-600 dark:text-teal-300"
      >
        <Plus className="h-3.5 w-3.5" /> Add segment
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <select aria-label="New segment kind" value={kind} onChange={e => setKind(e.target.value as PayrollSegmentKind)} className={inputClass}>
        {(Object.keys(KIND_LABEL) as PayrollSegmentKind[]).map(value => (
          <option key={value} value={value}>{KIND_LABEL[value]}</option>
        ))}
      </select>
      {kind === 'job' && (
        <select aria-label="New segment job" value={jobId} onChange={e => setJobId(e.target.value)} className={`${inputClass} max-w-[16rem]`}>
          <option value="">Choose job</option>
          {jobOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      )}
      <input type="time" aria-label="New segment start" value={start} onChange={e => setStart(e.target.value)} className={inputClass} />
      <span>–</span>
      <input type="time" aria-label="New segment end" value={end} onChange={e => setEnd(e.target.value)} className={inputClass} />
      <input placeholder="Reason" value={note} onChange={e => setNote(e.target.value)} className={`${inputClass} w-32`} />
      <button
        type="button"
        disabled={busy || !start || !end || (kind === 'job' && !jobId)}
        onClick={() => {
          void onAdd({
            kind,
            startedAt: phoenixLocalToIso(workDate, start),
            endedAt: phoenixLocalToIso(workDate, end),
            jobId: kind === 'job' && jobId ? Number(jobId) : null,
            note,
          }).then(() => setOpen(false));
        }}
        className="rounded-lg bg-teal-600 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
      >
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500">Cancel</button>
    </div>
  );
}

function MapSection({ workDate, segments, jobs }: { workDate: string; segments: PayrollSegmentView[]; jobs: Job[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Map</h4>
        <button type="button" onClick={() => setOpen(o => !o)} className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
          {open ? 'Hide map' : 'Show map'}
        </button>
      </div>
      {open && (
        <div className="mt-2">
          <Suspense fallback={<p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading map…</p>}>
            <PayrollDayMap workDate={workDate} segments={segments} jobs={jobs} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
