import React, { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, MapPin, Users, AlertTriangle, ClipboardCheck, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import type { Job, Technician } from '@/lib/data';
import {
  PLUMBING_PHASES,
  PHASE_HEADER_COLORS,
  canChangePhase, phaseBlockedMessage,
  normalizePhase,
} from '@/lib/phases';
import { formatShort, techColor } from '@/components/schedule/dateUtils';

interface Props {
  jobs: Job[];
  technicians: Technician[];
  onRefresh: () => Promise<void> | void;
  onOpenJob: (jobId: string) => void;
}

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
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const [dragOverPhase, setDragOverPhase] = useState<string | null>(null);
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null);

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
      const phase = normalizePhase(job.phase);
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

  const attemptPhaseChange = async (job: Job, phase: string) => {
    if (!canEdit || normalizePhase(phase) === normalizePhase(job.phase)) return;
    const gate = canChangePhase(job.phase, phase, {
      inspectionPassed: Boolean(job.inspectionPassed),
    });
    if (!gate.ok) {
      setBlockMsg(gate.message);
      return;
    }
    const next = normalizePhase(phase);
    setSavingId(job.id);
    setBlockMsg(null);
    const { error } = await supabase.from('jobs').update({ phase: next }).eq('id', job.id);
    setSavingId(null);
    if (error) {
      console.error('Failed to update phase:', error);
      setBlockMsg(error.message || 'Could not update phase.');
      return;
    }
    await onRefresh();
  };

  const toggleInspectionPassed = async (job: Job) => {
    if (!canEdit) return;
    const next = !job.inspectionPassed;
    setSavingId(job.id);
    const { error } = await supabase
      .from('jobs')
      .update({ inspection_passed: next })
      .eq('id', job.id);
    setSavingId(null);
    if (error) {
      setBlockMsg(error.message || 'Could not update inspection status. Apply the phase_dependencies migration if this column is missing.');
      return;
    }
    await onRefresh();
  };

  const togglePhase = (key: string) => {
    setOpenPhases(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const onDropPhase = (phase: string) => {
    setDragOverPhase(null);
    if (!draggingJobId) return;
    const job = activeJobs.find(j => j.id === draggingJobId);
    setDraggingJobId(null);
    if (!job) return;
    void attemptPhaseChange(job, phase);
  };

  const renderColumnBody = (col: { key: string; jobs: Job[] }) => (
    <div
      className={`flex-1 p-2 space-y-2 overflow-y-auto max-h-[70vh] transition-colors ${
        dragOverPhase === col.key ? 'bg-indigo-50/80 dark:bg-indigo-950/30' : ''
      }`}
      onDragOver={e => {
        if (!canEdit || col.key === 'Other') return;
        e.preventDefault();
        setDragOverPhase(col.key);
      }}
      onDragLeave={() => setDragOverPhase(prev => (prev === col.key ? null : prev))}
      onDrop={e => {
        e.preventDefault();
        if (col.key === 'Other') return;
        onDropPhase(col.key);
      }}
    >
      {col.jobs.length === 0 ? (
        <p className="text-[11px] text-slate-400 text-center py-6">
          {canEdit && col.key !== 'Other' ? 'Drop job here' : 'No jobs'}
        </p>
      ) : (
        col.jobs.map(job => (
          <JobKanbanCard
            key={job.id}
            job={job}
            canEdit={canEdit}
            saving={savingId === job.id}
            techName={techName}
            onOpen={() => onOpenJob(job.id)}
            onPhaseChange={phase => void attemptPhaseChange(job, phase)}
            onToggleInspection={() => void toggleInspectionPassed(job)}
            onDragStart={() => setDraggingJobId(job.id)}
            onDragEnd={() => { setDraggingJobId(null); setDragOverPhase(null); }}
          />
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400 px-0.5">
        Pipeline: Rough-In → Top-Out → Trim → Final → Punch. Drag or change phase — skips are blocked.
        Mark inspection passed before Trim.
      </p>

      {blockMsg && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="flex-1 font-semibold leading-snug">{blockMsg}</p>
          <button
            type="button"
            onClick={() => setBlockMsg(null)}
            className="p-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Desktop: horizontal Kanban */}
      <div className="hidden md:flex gap-3 overflow-x-auto pb-2 min-h-[420px]">
        {columns.map(col => (
          <div
            key={col.key}
            className={`shrink-0 w-72 flex flex-col bg-slate-100/80 dark:bg-slate-900/60 rounded-xl border ${
              dragOverPhase === col.key
                ? 'border-indigo-400 dark:border-indigo-500'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className={`px-3 py-2.5 rounded-t-xl border-b font-black text-xs uppercase tracking-wide flex items-center justify-between ${PHASE_HEADER_COLORS[col.key] ?? PHASE_HEADER_COLORS.Other}`}>
              <span>{col.key}</span>
              <span className="tabular-nums opacity-80">{col.jobs.length}</span>
            </div>
            {renderColumnBody(col)}
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
              className={`rounded-xl border overflow-hidden bg-white dark:bg-slate-900 ${
                dragOverPhase === col.key
                  ? 'border-indigo-400 dark:border-indigo-500'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => togglePhase(col.key)}
                className={`w-full min-h-[48px] px-3 py-2 flex items-center gap-2 text-left font-black text-xs uppercase tracking-wide ${PHASE_HEADER_COLORS[col.key] ?? PHASE_HEADER_COLORS.Other}`}
                aria-expanded={open}
              >
                {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                <span className="flex-1">{col.key}</span>
                <span className="tabular-nums opacity-80">{col.jobs.length}</span>
              </button>
              {open && renderColumnBody(col)}
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
  onToggleInspection: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}> = ({
  job, canEdit, saving, techName, onOpen, onPhaseChange, onToggleInspection, onDragStart, onDragEnd,
}) => {
  const crew = techIds(job);
  const end = job.endDate ?? job.date;
  const phase = normalizePhase(job.phase);

  return (
    <div
      draggable={canEdit}
      onDragStart={e => {
        if (!canEdit) return;
        e.dataTransfer.setData('text/plain', job.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-3 space-y-2 ${
        canEdit ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
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

      <button
        type="button"
        disabled={!canEdit || saving}
        onClick={e => { e.stopPropagation(); onToggleInspection(); }}
        className={`w-full min-h-[36px] inline-flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wide rounded-lg border px-2 ${
          job.inspectionPassed
            ? 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800'
            : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
        } disabled:opacity-50`}
      >
        <ClipboardCheck className="w-3.5 h-3.5" />
        {job.inspectionPassed ? 'Inspection passed' : 'Mark inspection passed'}
      </button>

      {canEdit ? (
        <select
          value={phase}
          disabled={saving}
          onChange={e => onPhaseChange(e.target.value)}
          aria-label={`Phase for ${job.customerName}`}
          className="w-full min-h-[40px] text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-2 outline-none focus:ring-2 focus:ring-indigo-500"
          onClick={e => e.stopPropagation()}
        >
          {PLUMBING_PHASES.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      ) : (
        <span className="inline-block text-[10px] font-black uppercase tracking-wide text-slate-500">
          {phase}
        </span>
      )}
    </div>
  );
};

export default MasterBoard;
