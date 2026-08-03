import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import type { Job, Technician } from '@/lib/data';
import { PLUMBING_PHASES } from '@/components/PhaseDropdown';
import { formatShort, techColor } from '@/components/schedule/dateUtils';

interface Props {
  jobs: Job[];
  technicians: Technician[];
  onRefresh: () => Promise<void> | void;
  onOpenJob: (jobId: string) => void;
}

const PHASE_HEADER: Record<string, string> = {
  Underground: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200 dark:border-amber-800',
  'Rough-In': 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  'Top-Out': 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200 border-violet-200 dark:border-violet-800',
  'Trim/Finish': 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
  'Service Call': 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200 border-rose-200 dark:border-rose-800',
  'T&M': 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
  Other: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200 border-orange-200 dark:border-orange-800',
};

function techIds(job: Job): string[] {
  if (job.technicianIds?.length) return job.technicianIds.filter(Boolean);
  return job.technicianId ? [job.technicianId] : [];
}

const MasterBoard: React.FC<Props> = ({ jobs, technicians, onRefresh, onOpenJob }) => {
  const { canEdit } = useAuth();
  const [openPhases, setOpenPhases] = useState<Record<string, boolean>>(() =>
    Object.fromEntries([...PLUMBING_PHASES, 'Other'].map(p => [p, true])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  const activeJobs = useMemo(
    () => jobs.filter(j => j.status !== 'completed'),
    [jobs],
  );

  const columns = useMemo(() => {
    const known = new Set<string>(PLUMBING_PHASES);
    const buckets: Record<string, Job[]> = {};
    for (const p of PLUMBING_PHASES) buckets[p] = [];
    buckets.Other = [];

    for (const job of activeJobs) {
      const phase = job.phase || 'Rough-In';
      if (known.has(phase)) buckets[phase].push(job);
      else buckets.Other.push(job);
    }

    const keys: string[] = [...PLUMBING_PHASES];
    if (buckets.Other.length) keys.push('Other');
    return keys.map(key => ({
      key,
      jobs: buckets[key].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }, [activeJobs]);

  const techName = (id: string) => technicians.find(t => t.id === id)?.name ?? 'Crew';

  const savePhase = async (job: Job, phase: string) => {
    if (!canEdit || phase === job.phase) return;
    setSavingId(job.id);
    const { error } = await supabase.from('jobs').update({ phase }).eq('id', job.id);
    setSavingId(null);
    if (error) {
      console.error('Failed to update phase:', error);
      return;
    }
    await onRefresh();
  };

  const togglePhase = (key: string) => {
    setOpenPhases(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400 px-0.5">
        All active jobs by plumbing phase. Tap a card to open its Timeline.
      </p>

      {/* Desktop: horizontal Kanban */}
      <div className="hidden md:flex gap-3 overflow-x-auto pb-2 min-h-[420px]">
        {columns.map(col => (
          <div
            key={col.key}
            className="shrink-0 w-72 flex flex-col bg-slate-100/80 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800"
          >
            <div className={`px-3 py-2.5 rounded-t-xl border-b font-black text-xs uppercase tracking-wide flex items-center justify-between ${PHASE_HEADER[col.key] ?? PHASE_HEADER.Other}`}>
              <span>{col.key}</span>
              <span className="tabular-nums opacity-80">{col.jobs.length}</span>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[70vh]">
              {col.jobs.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-6">No jobs</p>
              ) : (
                col.jobs.map(job => (
                  <JobKanbanCard
                    key={job.id}
                    job={job}
                    canEdit={canEdit}
                    saving={savingId === job.id}
                    techName={techName}
                    onOpen={() => onOpenJob(job.id)}
                    onPhaseChange={phase => void savePhase(job, phase)}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: stacked accordion by phase */}
      <div className="md:hidden space-y-2">
        {columns.map(col => {
          const open = openPhases[col.key] !== false;
          return (
            <div
              key={col.key}
              className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => togglePhase(col.key)}
                className={`w-full min-h-[48px] px-3 py-2 flex items-center gap-2 text-left font-black text-xs uppercase tracking-wide ${PHASE_HEADER[col.key] ?? PHASE_HEADER.Other}`}
                aria-expanded={open}
              >
                {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                <span className="flex-1">{col.key}</span>
                <span className="tabular-nums opacity-80">{col.jobs.length}</span>
              </button>
              {open && (
                <div className="p-2 space-y-2">
                  {col.jobs.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-4">No jobs in this phase</p>
                  ) : (
                    col.jobs.map(job => (
                      <JobKanbanCard
                        key={job.id}
                        job={job}
                        canEdit={canEdit}
                        saving={savingId === job.id}
                        techName={techName}
                        onOpen={() => onOpenJob(job.id)}
                        onPhaseChange={phase => void savePhase(job, phase)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const JobKanbanCard: React.FC<{
  job: Job;
  canEdit: boolean;
  saving: boolean;
  techName: (id: string) => string;
  onOpen: () => void;
  onPhaseChange: (phase: string) => void;
}> = ({ job, canEdit, saving, techName, onOpen, onPhaseChange }) => {
  const crew = techIds(job);
  const end = job.endDate ?? job.date;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-3 space-y-2">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left min-h-[44px] -m-1 p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <div className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
          {job.customerName}
        </div>
        {job.address && (
          <div className="flex items-start gap-1 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{job.address}</span>
          </div>
        )}
        <div className="mt-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          {formatShort(job.date)} – {formatShort(end)}
        </div>
      </button>

      {crew.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Users className="w-3 h-3 text-slate-400 shrink-0" />
          {crew.map(id => (
            <span
              key={id}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-white"
              style={{ backgroundColor: techColor(id) }}
            >
              {techName(id)}
            </span>
          ))}
        </div>
      )}

      {canEdit ? (
        <select
          value={(PLUMBING_PHASES as readonly string[]).includes(job.phase) ? job.phase : job.phase || 'Rough-In'}
          disabled={saving}
          onChange={e => onPhaseChange(e.target.value)}
          aria-label={`Phase for ${job.customerName}`}
          className="w-full min-h-[40px] text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-2 outline-none focus:ring-2 focus:ring-indigo-500"
          onClick={e => e.stopPropagation()}
        >
          {PLUMBING_PHASES.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
          {job.phase && !(PLUMBING_PHASES as readonly string[]).includes(job.phase) && (
            <option value={job.phase}>{job.phase}</option>
          )}
        </select>
      ) : (
        <span className="inline-block text-[10px] font-black uppercase tracking-wide text-slate-500">
          {job.phase || 'Rough-In'}
        </span>
      )}
    </div>
  );
};

export default MasterBoard;
