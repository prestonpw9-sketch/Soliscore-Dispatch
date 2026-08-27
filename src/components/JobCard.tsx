import React, { useState, useEffect } from 'react';
import type { Job } from '@/lib/data';
import { PLUMBING_PHASES, type PlumbingPhase } from '@/components/PhaseDropdown';
import { avatarGradientClass } from '@/lib/avatarStyle';

// ── Phase colors ───────────────────────────────────────────────────────────

const PHASE_COLORS: Record<PlumbingPhase, string> = {
  'Underground':  'bg-amber-50   text-amber-700  border-amber-200/80  dark:bg-amber-400/20  dark:text-amber-200  dark:border-amber-300/30',
  'Rough-In':     'bg-blue-50    text-blue-700   border-blue-200/80   dark:bg-blue-400/20   dark:text-blue-200   dark:border-blue-300/30',
  'Top-Out':      'bg-purple-50  text-purple-700 border-purple-200/80 dark:bg-purple-400/20 dark:text-purple-200 dark:border-purple-300/30',
  'Trim/Finish':  'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-400/20 dark:text-emerald-200 dark:border-emerald-300/30',
  'Service Call': 'bg-rose-50    text-rose-700   border-rose-200/80   dark:bg-rose-400/25   dark:text-rose-200   dark:border-rose-300/35',
  'T&M':          'bg-slate-100  text-slate-700  border-slate-200     dark:bg-slate-500/30  dark:text-slate-100  dark:border-slate-400/30',
};

const PHASE_ACCENT: Record<PlumbingPhase, string> = {
  'Underground':  'border-l-amber-400',
  'Rough-In':     'border-l-blue-400',
  'Top-Out':      'border-l-violet-500',
  'Trim/Finish':  'border-l-emerald-400',
  'Service Call': 'border-l-rose-500',
  'T&M':          'border-l-slate-400',
};

const DEFAULT_PHASE_COLORS = 'bg-slate-100 text-slate-800 border-slate-200';
const DEFAULT_ACCENT = 'border-l-slate-400';

// ── Types ──────────────────────────────────────────────────────────────────

interface JobCardProps {
  job?: Job;
  technicianName?: string;
  onClick?: () => void;
  onPhaseChange?: (jobId: string, newPhase: PlumbingPhase) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

const JobCard: React.FC<JobCardProps> = ({
  job,
  technicianName = 'Unassigned',
  onClick,
  onPhaseChange,
}) => {
  const [phase, setPhase] = useState<PlumbingPhase>(
    (job?.phase as PlumbingPhase) ?? 'Rough-In'
  );

  // Sync if upstream data changes
  useEffect(() => {
    if (job?.phase) setPhase(job.phase as PlumbingPhase);
  }, [job?.phase]);

  const handlePhaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPhase = e.target.value as PlumbingPhase;
    setPhase(newPhase);
    if (onPhaseChange && job?.id) {
      onPhaseChange(job.id, newPhase);
    }
  };

  const customerName  = job?.customerName || 'Untitled Job';
  const address       = job?.address      || '—';
  const description   = job?.description   || job?.serviceType || 'No description added.';
  const initial       = technicianName.charAt(0).toUpperCase();
  const accent        = PHASE_ACCENT[phase] ?? DEFAULT_ACCENT;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
      className={`relative overflow-hidden bg-white/85 dark:bg-slate-900/70 backdrop-blur-md rounded-xl border border-slate-200/80 dark:border-white/10 border-l-[6px] ${accent} p-5 hover:shadow-xl transition-shadow flex flex-col gap-4 w-full cursor-pointer shadow-[0_10px_28px_rgba(15,23,42,0.08)] dark:shadow-[0_14px_36px_rgba(0,0,0,0.55)]`}
    >
      {/* Header */}
      <div>
        <div className="flex justify-between items-start mb-1 gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-white truncate flex-1">
            {customerName}
          </h3>
          <span className="text-[10px] font-black text-slate-500 dark:text-slate-200 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full border border-slate-200/80 dark:border-white/15 shrink-0">
            #{job?.id ?? '1042'}
          </span>
        </div>
        <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
          <svg className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="truncate">{address}</span>
        </div>
      </div>

      {/* Description */}
      <div className="bg-slate-50 dark:bg-white/5 rounded-lg p-3 text-xs text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-white/10">
        <p className="line-clamp-2 leading-relaxed">{description}</p>
      </div>

      {/* Footer: technician + phase selector */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-white/10">
        <div className="flex items-center text-xs font-bold text-slate-600 dark:text-slate-300 min-w-0 mr-2">
          <div className={`w-6 h-6 rounded-full ${avatarGradientClass(technicianName)} flex items-center justify-center mr-2 text-[10px] font-black text-white shrink-0 shadow-sm`}>
            {initial}
          </div>
          <span className="truncate">{technicianName}</span>
        </div>

        <select
          value={phase}
          onChange={handlePhaseChange}
          onClick={e => e.stopPropagation()}
          aria-label="Job phase"
          className={`font-black text-[11px] rounded-full px-2.5 py-1 border outline-none cursor-pointer transition-colors ${PHASE_COLORS[phase] ?? DEFAULT_PHASE_COLORS}`}
        >
          {PLUMBING_PHASES.map(p => (
            <option key={p} value={p} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-white font-semibold">
              {p}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default JobCard;
