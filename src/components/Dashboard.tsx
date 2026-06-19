import React, { useState } from 'react';
import { ArrowRight, Calculator, CalendarDays } from 'lucide-react';
import type { Job, Technician } from '@/lib/data';
import StatsCards from './StatsCards';
import JobCard from './JobCard';
import { BlueprintCard } from './BlueprintCard';
import { SitePhotosCard } from './SitePhotosCard';
import TeamModal from './TeamModal';

interface Props {
  jobs: Job[];
  technicians: Technician[];
  todayStr: string;
  onViewCalendar: () => void;
  onOpenEstimator: () => void;
  onPhaseChange: (jobId: string, newPhase: string) => void;
  onHire: (name: string, role: string) => void;
  onFire: (id: string) => void;
}

const Dashboard: React.FC<Props> = ({
  jobs,
  technicians,
  todayStr,
  onViewCalendar,
  onOpenEstimator,
  onPhaseChange,
  onHire,
  onFire,
}) => {
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  const todayJobs      = jobs.filter(j => j.date === todayStr);
  const upcomingJobs   = todayJobs.filter(j => j.status !== 'completed').slice(0, 5);
  const activeJobCount = jobs.filter(j => j.status !== 'completed').length;
  const activePlumbers = technicians.filter(t => t.role === 'Plumber').length;

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Overview</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Dispatch Control</p>
        </div>
        <button
          type="button"
          onClick={onOpenEstimator}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold shadow-md transition-colors shrink-0"
        >
          <Calculator className="w-5 h-5" />
          New Estimate
        </button>
      </div>

      <StatsCards
        jobs={jobs}
        activeJobCount={activeJobCount}
        activeBlueprints={4}
        sitePhotos={12}
        activePlumbers={activePlumbers}
        onOpenTeam={() => setIsTeamModalOpen(true)}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                Today's Remaining Schedule
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Incomplete field deployment routing
              </p>
            </div>
            <button
              type="button"
              onClick={onViewCalendar}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
            >
              Open Calendar <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcomingJobs.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400 font-medium">
                🎉 No remaining pending jobs on the schedule for today!
              </div>
            ) : (
              upcomingJobs.map(job => {
                const crew = job.technicianIds?.length
                  ? job.technicianIds
                  : job.technicianId
                    ? [job.technicianId]
                    : [];
                const crewNames = technicians
                  .filter(t => crew.includes(t.id))
                  .map(t => t.name);
                const techName = crewNames.length ? crewNames.join(', ') : 'Unassigned';
                return (
                  <div
                    key={job.id}
                    className="p-4 border-b border-slate-100 dark:border-slate-800/50 last:border-0 flex justify-center hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <JobCard
                      job={job}
                      technicianName={techName}
                      onPhaseChange={onPhaseChange}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <BlueprintCard />
          <SitePhotosCard />
        </div>
      </div>

      <TeamModal
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
      />
    </div>
  );
};

export default Dashboard;