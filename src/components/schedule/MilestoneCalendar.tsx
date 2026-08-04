import React, { useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, ClipboardCheck, Package, Flag, X, Loader2, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import type { Job } from '@/lib/data';
import {
  formatMonthYear, formatShort, parseYMD, phoenixMonthAnchor, toYMD, todayYMD,
} from '@/components/schedule/dateUtils';

export type MilestoneKind = 'inspection' | 'deadline' | 'material';

interface MilestoneEvent {
  id: string;
  jobId: string;
  jobLabel: string;
  date: string;
  kind: MilestoneKind;
  label: string;
}

interface Props {
  jobs: Job[];
  onRefresh: () => Promise<void> | void;
  onOpenJob: (jobId: string) => void;
}

const KIND_STYLE: Record<MilestoneKind, { dot: string; chip: string; icon: typeof Flag }> = {
  inspection: {
    dot: 'bg-indigo-500',
    chip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
    icon: ClipboardCheck,
  },
  deadline: {
    dot: 'bg-rose-500',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
    icon: Flag,
  },
  material: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
    icon: Package,
  },
};

function buildEvents(jobs: Job[]): MilestoneEvent[] {
  const events: MilestoneEvent[] = [];
  for (const job of jobs) {
    if (job.status === 'completed') continue;
    if (job.inspectionDate) {
      events.push({
        id: `${job.id}-inspection`,
        jobId: job.id,
        jobLabel: job.customerName,
        date: job.inspectionDate,
        kind: 'inspection',
        label: 'Inspection',
      });
    } else if (job.serviceType === 'Inspection' || job.type === 'inspection') {
      events.push({
        id: `${job.id}-inspection-svc`,
        jobId: job.id,
        jobLabel: job.customerName,
        date: job.date,
        kind: 'inspection',
        label: 'Inspection (service)',
      });
    }
    if (job.deadlineDate) {
      events.push({
        id: `${job.id}-deadline`,
        jobId: job.id,
        jobLabel: job.customerName,
        date: job.deadlineDate,
        kind: 'deadline',
        label: 'Deadline',
      });
    }
    if (job.materialArrivalDate) {
      events.push({
        id: `${job.id}-material`,
        jobId: job.id,
        jobLabel: job.customerName,
        date: job.materialArrivalDate,
        kind: 'material',
        label: 'Material arrival',
      });
    }
  }
  return events;
}

const MilestoneCalendar: React.FC<Props> = ({ jobs, onRefresh, onOpenJob }) => {
  const { canEdit } = useAuth();
  const [anchor, setAnchor] = useState(() => phoenixMonthAnchor());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editJob, setEditJob] = useState<Job | null>(null);

  const events = useMemo(() => buildEvents(jobs), [jobs]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, MilestoneEvent[]>();
    for (const e of events) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return m;
  }, [events]);

  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0 Sun
  const today = todayYMD();

  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toYMD(new Date(year, month, i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const dayEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  const goPrev = () => setAnchor(new Date(year, month - 1, 1));
  const goNext = () => setAnchor(new Date(year, month + 1, 1));
  const goToday = () => {
    setAnchor(phoenixMonthAnchor());
    setSelectedDay(todayYMD());
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h2 className="text-base font-black text-slate-900 dark:text-white">
          {formatMonthYear(anchor)}
        </h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={goToday}
            className="min-h-[40px] px-3 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white">
            Today
          </button>
          <button type="button" onClick={goPrev} aria-label="Previous month"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={goNext} aria-label="Next month"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 px-0.5">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Inspection</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Deadline</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Materials</span>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="py-2 text-center text-[10px] font-black uppercase text-slate-400">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((ymd, idx) => {
            if (!ymd) {
              return <div key={`e-${idx}`} className="min-h-[56px] sm:min-h-[72px] bg-slate-50/50 dark:bg-slate-950/40 border-b border-r border-slate-100 dark:border-slate-800" />;
            }
            const dayEventsForCell = eventsByDay.get(ymd) ?? [];
            const kinds = [...new Set(dayEventsForCell.map(e => e.kind))];
            const isToday = ymd === today;
            const selected = ymd === selectedDay;
            const dt = parseYMD(ymd);
            return (
              <button
                key={ymd}
                type="button"
                onClick={() => setSelectedDay(ymd)}
                className={`min-h-[56px] sm:min-h-[72px] p-1.5 text-left border-b border-r border-slate-100 dark:border-slate-800 transition-colors ${
                  selected
                    ? 'bg-indigo-50 dark:bg-indigo-950/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                } ${isToday ? 'ring-inset ring-2 ring-indigo-400' : ''}`}
              >
                <span className={`text-xs font-bold tabular-nums ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-200'}`}>
                  {dt.getDate()}
                </span>
                {kinds.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {kinds.map(k => (
                      <span key={k} className={`w-1.5 h-1.5 rounded-full ${KIND_STYLE[k].dot}`} />
                    ))}
                    {dayEventsForCell.length > kinds.length && (
                      <span className="text-[9px] text-slate-400 font-bold">+{dayEventsForCell.length - kinds.length}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail panel / bottom sheet style on mobile */}
      {selectedDay && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-black text-slate-900 dark:text-white">
                {parseYMD(selectedDay).toLocaleDateString('en-US', {
                  weekday: 'long', month: 'short', day: 'numeric',
                })}
              </h3>
              <p className="text-xs text-slate-500">{dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}</p>
            </div>
            <button type="button" onClick={() => setSelectedDay(null)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          {dayEvents.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No inspections, deadlines, or material arrivals.</p>
          ) : (
            <ul className="space-y-2">
              {dayEvents.map(e => {
                const Icon = KIND_STYLE[e.kind].icon;
                const job = jobs.find(j => j.id === e.jobId);
                return (
                  <li key={e.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2 py-1 rounded-md ${KIND_STYLE[e.kind].chip}`}>
                      <Icon className="w-3 h-3" /> {e.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenJob(e.jobId)}
                      className="flex-1 text-left text-sm font-bold text-slate-800 dark:text-slate-100 min-h-[40px]"
                    >
                      {e.jobLabel}
                    </button>
                    {canEdit && job && (
                      <button
                        type="button"
                        onClick={() => setEditJob(job)}
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 min-h-[40px] px-2"
                      >
                        Edit dates
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {editJob && (
        <EditMilestonesModal
          job={editJob}
          onClose={() => setEditJob(null)}
          onSaved={async () => {
            setEditJob(null);
            await onRefresh();
          }}
        />
      )}
    </div>
  );
};

const EditMilestonesModal: React.FC<{
  job: Job;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}> = ({ job, onClose, onSaved }) => {
  const [inspection, setInspection] = useState(job.inspectionDate ?? '');
  const [deadline, setDeadline] = useState(job.deadlineDate ?? '');
  const [material, setMaterial] = useState(job.materialArrivalDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('jobs').update({
      inspection_date: inspection || null,
      deadline_date: deadline || null,
      material_arrival_date: material || null,
    }).eq('id', job.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-black text-slate-900 dark:text-white">Key dates</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{job.customerName}</p>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Inspection date
            <input type="date" value={inspection} onChange={e => setInspection(e.target.value)}
              className="mt-1 w-full min-h-[44px] px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Deadline
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
              className="mt-1 w-full min-h-[44px] px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Material arrival
            <input type="date" value={material} onChange={e => setMaterial(e.target.value)}
              className="mt-1 w-full min-h-[44px] px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="flex-1 min-h-[44px] px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold">
              Cancel
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={saving}
              className="flex-1 min-h-[44px] px-4 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
            </button>
          </div>
          <p className="text-[10px] text-slate-400">Clear a field and save to remove that milestone.</p>
          <p className="text-[10px] text-slate-400">Job span: {formatShort(job.date)} – {formatShort(job.endDate ?? job.date)}</p>
        </div>
      </div>
    </div>
  );
};

export default MilestoneCalendar;
