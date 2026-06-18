import React, { useState } from 'react';
import {
  Briefcase, Map, Camera, Users, FolderOpen, ChevronDown,
} from 'lucide-react';
import type { Job } from '@/lib/data';

interface Props {
  jobs: Job[];
  jobsToday: number;
  activeBlueprints: number;
  sitePhotos: number;
  activePlumbers: number;
  onOpenTeam: () => void;
}

const StatsCards: React.FC<Props> = ({
  jobs,
  jobsToday,
  activeBlueprints,
  sitePhotos,
  activePlumbers,
  onOpenTeam,
}) => {
  const [quickRefOpen, setQuickRefOpen] = useState(false);

  const cards = [
    {
      label: 'Active Jobs',
      value: jobsToday,
      icon: Briefcase,
      colorBg: 'bg-indigo-600 dark:bg-indigo-500',
      trend: 'Live',
      clickable: false,
    },
    {
      label: 'Active Blueprints',
      value: activeBlueprints,
      icon: Map,
      colorBg: 'bg-blue-600 dark:bg-blue-500',
      trend: 'Synced',
      clickable: false,
    },
    {
      label: 'Site Photos',
      value: sitePhotos,
      icon: Camera,
      colorBg: 'bg-emerald-600 dark:bg-emerald-500',
      trend: 'Updating',
      clickable: false,
    },
    {
      label: 'Active Plumbers',
      value: activePlumbers,
      icon: Users,
      colorBg: 'bg-teal-600 dark:bg-teal-500',
      trend: 'Deployed',
      clickable: true,
    },
  ] as const;

  const activeJobs = jobs.filter(j => j.status === 'active');
const submittals = jobs.filter(j => j.status === 'pending');   // pending = awaiting dispatch
const estimates  = jobs.filter(j => j.status === 'scheduled'); // scheduled = not yet started

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
      {cards.map(c => (
        <button
          key={c.label}
          type="button"
          onClick={c.clickable ? onOpenTeam : undefined}
          className={`${c.colorBg} rounded-2xl p-5 shadow-md hover:brightness-110 transition-all duration-200 group ${
            c.clickable ? 'cursor-pointer hover:-translate-y-1 active:scale-95' : 'cursor-default'
          } flex flex-col justify-between text-white border border-white/10 text-left`}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
              <c.icon className="w-5 h-5 text-white" />
            </div>
            <span className="flex items-center text-[10px] font-black text-white/70 uppercase tracking-widest">
              {c.trend}
            </span>
          </div>
          <div>
            <h4 className="text-3xl font-black text-white tracking-tight leading-none">
              {c.value}
            </h4>
            <p className="text-sm font-bold text-white/90 mt-2">{c.label}</p>
          </div>
        </button>
      ))}

      {/* Quick Reference Folder */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setQuickRefOpen(!quickRefOpen)}
          className={`w-full bg-blue-600 dark:bg-blue-500 rounded-2xl p-5 shadow-md hover:brightness-110 transition-all duration-200 group flex flex-col justify-between text-white border border-white/10 text-left h-full ${
            quickRefOpen ? 'ring-2 ring-white/30' : ''
          }`}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            <span className="flex items-center gap-1 text-[10px] font-black text-white/70 uppercase tracking-widest">
              {quickRefOpen ? 'Close' : 'Open'}
              <ChevronDown className={`w-3 h-3 transition-transform ${quickRefOpen ? 'rotate-180' : ''}`} />
            </span>
          </div>
          <div>
            <h4 className="text-3xl font-black text-white tracking-tight leading-none">
              {activeJobs.length + submittals.length + estimates.length}
            </h4>
           <p className="text-sm font-bold text-white/90 mt-2">Submittals</p>
          </div>
        </button>

        {/* Dropdown panel */}
        {quickRefOpen && (
          <div className="absolute top-[calc(100%+0.5rem)] left-0 right-0 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 p-4 max-h-[400px] overflow-auto">
            <div className="space-y-4">
              <div>
                <h5 className="text-xs font-black uppercase text-orange-600 dark:text-orange-400 mb-2 flex items-center gap-2">
                  <Briefcase className="w-3 h-3" />
                  Active Jobs ({activeJobs.length})
                </h5>
                {activeJobs.length === 0 ? (
                  <p className="text-xs text-slate-400">No active jobs</p>
                ) : (
                  <ul className="space-y-1">
                    {activeJobs.slice(0, 4).map(job => (
                      <li key={job.id} className="text-sm text-slate-700 dark:text-slate-300 truncate">
                        {job.customerName || 'Untitled job'}
                      </li>
                    ))}
                    {activeJobs.length > 4 && (
                      <li className="text-xs text-orange-500 font-bold">+ {activeJobs.length - 4} more</li>
                    )}
                  </ul>
                )}
              </div>

              <div>
                <h5 className="text-xs font-black uppercase text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-2">
                  <FolderOpen className="w-3 h-3" />
                  Submittals ({submittals.length})
                </h5>
                {submittals.length === 0 ? (
                  <p className="text-xs text-slate-400">No submittals</p>
                ) : (
                  <ul className="space-y-1">
                    {submittals.slice(0, 4).map(job => (
                      <li key={job.id} className="text-sm text-slate-700 dark:text-slate-300 truncate">
                        {job.customerName || 'Untitled job'}
                      </li>
                    ))}
                    {submittals.length > 4 && (
                      <li className="text-xs text-blue-500 font-bold">+ {submittals.length - 4} more</li>
                    )}
                  </ul>
                )}
              </div>

              <div>
                <h5 className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-2">
                  <FolderOpen className="w-3 h-3" />
                  Estimates ({estimates.length})
                </h5>
                {estimates.length === 0 ? (
                  <p className="text-xs text-slate-400">No estimates</p>
                ) : (
                  <ul className="space-y-1">
                    {estimates.slice(0, 4).map(job => (
                      <li key={job.id} className="text-sm text-slate-700 dark:text-slate-300 truncate">
                        {job.customerName || 'Untitled job'}
                      </li>
                    ))}
                    {estimates.length > 4 && (
                      <li className="text-xs text-emerald-500 font-bold">+ {estimates.length - 4} more</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default StatsCards;