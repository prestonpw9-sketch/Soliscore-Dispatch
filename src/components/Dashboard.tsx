import React from 'react';
import { ArrowRight, Calculator, CalendarDays, Star } from 'lucide-react';
import type { Job, Technician, TechDailyPriority } from '@/lib/data';
import StatsCards from './StatsCards';
import JobCard from './JobCard';
import { BlueprintCard } from './BlueprintCard';
import { SitePhotosCard } from './SitePhotosCard';
import TeamModal from './TeamModal';

interface Props {
  jobs: Job[];
  technicians: Technician[];
  techPriorities: TechDailyPriority[];
  submittalsCount: number;
  refreshSubmittals: () => Promise<number | void>;
  reportSubmittalsCount: (count: number) => void;
  todayStr: string;
  canEdit: boolean;
  onViewCalendar: () => void;
  onOpenEstimator: () => void;
  onPhaseChange: (jobId: string, newPhase: string) => void;
  onHire: (name: string, role: string) => void;
  onFire: (id: string) => void;
  onJobClick?: (job: Job) => void;
  onSetFirstPriority?: (technicianId: string, workDate: string, jobId: string) => Promise<void>;
}

function jobHasTech(job: Job, techId: string) {
  return (job.technicianIds?.includes(techId) ?? false) || job.technicianId === techId;
}

function jobActiveOnDay(job: Job, day: string) {
  const end = job.endDate ?? job.date;
  return job.date <= day && end >= day;
}

function sortTechJobs(
  techJobs: Job[],
  firstJobId: string | undefined,
): Job[] {
  return [...techJobs].sort((a, b) => {
    if (firstJobId) {
      if (a.id === firstJobId) return -1;
      if (b.id === firstJobId) return 1;
    }
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
}

const Dashboard: React.FC<Props> = ({
  jobs,
  technicians,
  techPriorities,
  submittalsCount,
  refreshSubmittals,
  reportSubmittalsCount,
  todayStr,
  canEdit,
  onViewCalendar,
  onOpenEstimator,
  onPhaseChange,
  onHire,
  onFire,
  onJobClick,
  onSetFirstPriority,
}) => {
  const [isTeamModalOpen, setIsTeamModalOpen] = React.useState(false);
  const [pinning, setPinning] = React.useState<string | null>(null);

  const todayJobs = jobs.filter(j => jobActiveOnDay(j, todayStr));
  const activeJobCount = jobs.filter(j => j.status !== 'completed').length;
  const activePlumbers = technicians.filter(t => t.role === 'Plumber').length;

  const priorityByTech = React.useMemo(() => {
    const map = new Map<string, string>();
    techPriorities
      .filter(p => p.workDate === todayStr)
      .forEach(p => map.set(p.technicianId, p.jobId));
    return map;
  }, [techPriorities, todayStr]);

  const techRoutes = technicians
    .map(t => {
      const techJobs = sortTechJobs(
        todayJobs.filter(j => jobHasTech(j, t.id) && j.status !== 'completed'),
        priorityByTech.get(t.id),
      );
      return { tech: t, jobs: techJobs };
    })
    .filter(route => route.jobs.length > 0);

  const handlePin = async (technicianId: string, jobId: string) => {
    if (!onSetFirstPriority) return;
    setPinning(`${technicianId}:${jobId}`);
    try {
      await onSetFirstPriority(technicianId, todayStr, jobId);
    } finally {
      setPinning(null);
    }
  };

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
        submittalsCount={submittalsCount}
        refreshSubmittals={refreshSubmittals}
        reportSubmittalsCount={reportSubmittalsCount}
        onOpenTeam={() => setIsTeamModalOpen(true)}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                Today's Crew Routes
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {canEdit
                  ? 'Pin the star on a job when a crew member has multiple stops today'
                  : 'Jobs grouped by crew — first stop shown at the top'}
              </p>
            </div>
            <button
              type="button"
              onClick={onViewCalendar}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
            >
              Open Schedule <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {techRoutes.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400 font-medium">
                No remaining jobs on the schedule for today.
              </div>
            ) : (
              techRoutes.map(({ tech, jobs: techJobs }) => {
                const firstJobId = priorityByTech.get(tech.id);
                const showPins = canEdit && techJobs.length > 1;

                return (
                  <div key={tech.id} className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-black text-sm">
                        {tech.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">{tech.name}</h4>
                        <p className="text-xs text-slate-500">{techJobs.length} stop{techJobs.length === 1 ? '' : 's'} today</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {techJobs.map((job, index) => {
                        const isPinnedFirst = firstJobId === job.id;
                        const pinKey = `${tech.id}:${job.id}`;

                        return (
                          <div key={job.id} className="flex items-start gap-2">
                            {showPins && (
                              <button
                                type="button"
                                title={isPinnedFirst ? 'First stop' : 'Make first stop'}
                                aria-label={isPinnedFirst ? 'First stop' : 'Make first stop'}
                                disabled={pinning === pinKey}
                                onClick={() => void handlePin(tech.id, job.id)}
                                className={`mt-4 p-2 rounded-lg border transition-colors shrink-0 ${
                                  isPinnedFirst
                                    ? 'bg-amber-100 border-amber-300 text-amber-600 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400'
                                    : 'bg-white border-slate-200 text-slate-400 hover:text-amber-500 hover:border-amber-300 dark:bg-slate-800 dark:border-slate-700'
                                }`}
                              >
                                <Star className={`w-4 h-4 ${isPinnedFirst ? 'fill-current' : ''}`} />
                              </button>
                            )}
                            <div className="flex-1 min-w-0">
                              {isPinnedFirst && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">
                                  <Star className="w-3 h-3 fill-current" /> 1st Stop
                                </span>
                              )}
                              {!isPinnedFirst && techJobs.length > 1 && (
                                <span className="inline-flex text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                                  Stop {index + 1}
                                </span>
                              )}
                              <JobCard
                                job={job}
                                technicianName={tech.name}
                                onPhaseChange={onPhaseChange}
                                onClick={() => onJobClick?.(job)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <BlueprintCard />
          <SitePhotosCard jobs={jobs} />
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
