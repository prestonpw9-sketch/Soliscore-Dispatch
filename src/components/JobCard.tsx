import React, { useState, useEffect } from 'react';
import type { Job } from '@/lib/data';

// Master dictionary of plumbing operational phases
const PLUMBING_PHASES = [
  "Underground",
  "Rough-In",
  "Top-Out",
  "Trim/Finish",
  "Service Call",
  "T&M"
];

// Tailwind color maps for each phase badge
const phaseColors: Record<string, string> = {
  "Underground": "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
  "Rough-In": "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50",
  "Top-Out": "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900/50",
  "Trim/Finish": "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900/50",
  "Service Call": "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50",
  "T&M": "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

interface JobCardProps {
  job?: Job & { phase?: string; tech?: string };
  onClick?: () => void;
  onPhaseChange?: (jobId: string, newPhase: string) => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, onClick, onPhaseChange }) => {
  const [phase, setPhase] = useState(job?.phase || "Rough-In");
  
  // Keep local dropdown state perfectly in sync if data changes upstream
  useEffect(() => {
    if (job?.phase) {
      setPhase(job.phase);
    }
  }, [job?.phase]);

  const customerName = job?.customerName || "Commercial Remodel - Main Restrooms";
  const address = job?.address || "Tucson, AZ";
  const description = job?.description || "Install sensor-flushed fixtures and fiberglass wall set.";
  const tech = job?.tech || "Unassigned";

  const handlePhaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPhase = e.target.value;
    setPhase(newPhase);
    if (onPhaseChange && job?.id) {
      onPhaseChange(job.id, newPhase);
    }
  };

  return (
    <div 
      onClick={onClick}
      className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 p-5 hover:shadow-md transition-shadow flex flex-col gap-4 max-w-sm w-full cursor-pointer"
    >
      {/* Top Section: Customer details & ID */}
      <div>
        <div className="flex justify-between items-start mb-1 gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-white truncate flex-1">{customerName}</h3>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-700 shrink-0">
            #{job?.id || "1042"}
          </span>
        </div>
        <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
          <svg className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="truncate">{address}</span>
        </div>
      </div>

      {/* Middle Section: Brief job details */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-xs text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800/80">
        <p className="line-clamp-2 leading-relaxed">{description}</p>
      </div>

      {/* Bottom Section: Technician badge and interactive dropdown */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center text-xs font-bold text-slate-600 dark:text-slate-400 min-w-0 mr-2">
           <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mr-2 text-[10px] font-black text-slate-600 dark:text-slate-300 shrink-0">
             {tech.charAt(0).toUpperCase()}
           </div>
           <span className="truncate">{tech}</span>
        </div>

        {/* Dynamic Interactive Phase Selector Dropdown */}
        <select
          value={phase}
          onChange={handlePhaseChange}
          onClick={(e) => e.stopPropagation()} 
          className={`font-bold text-[11px] rounded-full px-2.5 py-1 border outline-none cursor-pointer transition-colors ${phaseColors[phase] || 'bg-slate-100'}`}
        >
          {PLUMBING_PHASES.map((p) => (
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