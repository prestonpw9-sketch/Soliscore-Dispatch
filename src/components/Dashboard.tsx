import React from 'react';
import { ArrowRight, Calculator, CalendarDays, Star, CalendarOff } from 'lucide-react';
import type { Job, Technician, TechDailyPriority, TechTimeOff } from '@/lib/data';
import { isTechOffOnDay } from '@/lib/data';
import StatsCards from './StatsCards';
import JobCard from './JobCard';
import { BlueprintCard } from './BlueprintCard';
import { SitePhotosCard } from './SitePhotosCard';
import TeamModal from './TeamModal';

interface Props {
  jobs: Job[];
  technicians: Technician[];
  techPriorities: TechDailyPriority[];
  techTimeOff: TechTimeOff[];
  submittalsCount: number;
  blueprintsCount: number;
  sitePhotosCount: number;
  refreshSubmittals: () => Promise<number | void>;
  refreshBlueprints: () => Promise<number | void>;
  refreshSitePhotos: () => Promise<number | void>;
  reportSubmittalsCount: (count: number) => void;
  reportBlueprintsCount: (count: number) => void;
  reportSitePhotosCount: (count: number) => void;
  onJobsChanged?: () => void | Promise<unknown>;
  todayStr: string;
  canEdit: boolean;
  onViewCalendar: () => void;
  onOpenEstimator: () => void;
  onPhaseChange: (jobId: string, newPhase: string) => void;
  onHire: (name: string, role: string) => void;
  onFire: (id: string) => void;
  onJobClick?: (job: Job) => void;
  onSetStopPriority?: (
    technicianId: string,
    workDate: string,
    jobId: string,
    rank: 1 | 2 | null,
  ) => Promise<void>;
  onAddTimeOff?: (
    technicianId: string,
    startDate: string,
    endDate: string,
    note?: string | null,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  onDeleteTimeOff?: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}

function jobHasTech(job: Job, techId: string) {
  return (job.technicianIds?.includes(techId) ?? false) || job.technicianId === techId;
}

function jobActiveOnDay(job: Job, day: string) {
  const end = job.endDate ?? job.date;
  return job.date <= day && end >= day;
}

type RankMap = { first?: string; second?: string };

function sortTechJobs(techJobs: Job[], ranks: RankMap): Job[] {
  const rankOf = (id: string) => {
    if (ranks.first === id) return 1;
    if (ranks.second === id) return 2;
    return 99;
  };
  return [...techJobs].sort((a, b) => {
    const ra = rankOf(a.id);
    const rb = rankOf(b.id);
    if (ra !== rb) return ra - rb;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
}

const Dashboard: React.FC<Props> = ({
  jobs,
  technicians,
  techPriorities,
  techTimeOff,
  submittalsCount,
  blueprintsCount,
  sitePhotosCount,
  refreshSubmittals,
  refreshBlueprints,
  refreshSitePhotos,
  reportSubmittalsCount,
  reportBlueprintsCount,
  reportSitePhotosCount,
  onJobsChanged,
  todayStr,
  canEdit,
  onViewCalendar,
  onOpenEstimator,
  onPhaseChange,
  onHire,
  onFire,
  onJobClick,
  onSetStopPriority,
  onAddTimeOff,
  onDeleteTimeOff,
}) => {
  const [isTeamModalOpen, setIsTeamModalOpen] = React.useState(false);
  const [pinning, setPinning] = React.useState<string | null>(null);

  const todayJobs = jobs.filter(j => jobActiveOnDay(j, todayStr));
  const activeJobCount = jobs.filter(j => j.status !== 'completed').length;
  const activePlumbers = technicians.filter(t => t.role === 'Plumber').length;

  const priorityByTech = React.useMemo(() => {
    const map = new Map<string, RankMap>();
    techPriorities
      .filter(p => p.workDate === todayStr)
      .forEach(p => {
        const entry = map.get(p.technicianId) ?? {};
        if (p.stopRank === 2) entry.second = p.jobId;
        else entry.first = p.jobId;
        map.set(p.technicianId, entry);
      });
    return map;
  }, [techPriorities, todayStr]);

  const techRoutes = technicians
    .map(t => {
      const techJobs = sortTechJobs(
        todayJobs.filter(j => jobHasTech(j, t.id) && j.status !== 'completed'),
        priorityByTech.get(t.id) ?? {},
      );
      return { tech: t, jobs: techJobs };
    })
    .filter(route => route.jobs.length > 0);

  const offToday = technicians.filter(t => isTechOffOnDay(t.id, todayStr, techTimeOff));

  const handlePin = async (technicianId: string, jobId: string, stopCount: number) => {
    if (!onSetStopPriority) return;
    const ranks = priorityByTech.get(technicianId) ?? {};
    const isFirst = ranks.first === jobId;
    const isSecond = ranks.second === jobId;

    let next: 1 | 2 | null;
    if (isFirst || isSecond) {
      // Toggle off
      next = null;
    } else if (!ranks.first) {
      next = 1;
    } else if (stopCount >= 3 && !ranks.second) {
      next = 2;
    } else {
      // Already have 1st (and 2nd if 3+); clicking another job replaces 1st.
      next = 1;
    }

    setPinning(`${technicianId}:${jobId}`);
    try {
      await onSetStopPriority(technicianId, todayStr, jobId, next);
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
        activeBlueprints={blueprintsCount}
        sitePhotos={sitePhotosCount}
        activePlumbers={activePlumbers}
        submittalsCount={submittalsCount}
        refreshSubmittals={refreshSubmittals}
        refreshBlueprints={refreshBlueprints}
        refreshSitePhotos={refreshSitePhotos}
        reportSubmittalsCount={reportSubmittalsCount}
        reportBlueprintsCount={reportBlueprintsCount}
        reportSitePhotosCount={reportSitePhotosCount}
        onJobsChanged={onJobsChanged}
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
                  ? 'Star 1st stop — and 2nd when a crew has 3+ stops today'
                  : 'Jobs grouped by crew — starred stops shown at the top'}
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
            {offToday.length > 0 && (
              <div className="p-4 bg-rose-50/80 dark:bg-rose-950/20">
                <p className="text-[10px] font-black uppercase tracking-wide text-rose-600 dark:text-rose-300 mb-2 flex items-center gap-1">
                  <CalendarOff className="w-3.5 h-3.5" /> Off today — do not schedule
                </p>
                <div className="flex flex-wrap gap-2">
                  {offToday.map(t => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-sm font-bold text-rose-700 dark:text-rose-300"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {techRoutes.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400 font-medium">
                No remaining jobs on the schedule for today.
              </div>
            ) : (
              techRoutes.map(({ tech, jobs: techJobs }) => {
                const ranks = priorityByTech.get(tech.id) ?? {};
                const showPins = canEdit && techJobs.length > 1;
                const allowSecond = techJobs.length >= 3;

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
                        const isPinnedFirst = ranks.first === job.id;
                        const isPinnedSecond = ranks.second === job.id;
                        const isPinned = isPinnedFirst || isPinnedSecond;
                        const pinKey = `${tech.id}:${job.id}`;
                        let pinTitle = 'Make 1st stop';
                        if (isPinnedFirst) pinTitle = 'Clear 1st stop';
                        else if (isPinnedSecond) pinTitle = 'Clear 2nd stop';
                        else if (ranks.first && allowSecond && !ranks.second) pinTitle = 'Make 2nd stop';

                        return (
                          <div key={job.id} className="flex items-start gap-2">
                            {showPins && (
                              <button
                                type="button"
                                title={pinTitle}
                                aria-label={pinTitle}
                                disabled={pinning === pinKey}
                                onClick={() => void handlePin(tech.id, job.id, techJobs.length)}
                                className={`mt-4 p-2 rounded-lg border transition-colors shrink-0 ${
                                  isPinnedFirst
                                    ? 'bg-amber-100 border-amber-300 text-amber-600 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400'
                                    : isPinnedSecond
                                      ? 'bg-sky-100 border-sky-300 text-sky-600 dark:bg-sky-900/30 dark:border-sky-700 dark:text-sky-400'
                                      : 'bg-white border-slate-200 text-slate-400 hover:text-amber-500 hover:border-amber-300 dark:bg-slate-800 dark:border-slate-700'
                                }`}
                              >
                                <Star className={`w-4 h-4 ${isPinned ? 'fill-current' : ''}`} />
                              </button>
                            )}
                            <div className="flex-1 min-w-0">
                              {isPinnedFirst && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">
                                  <Star className="w-3 h-3 fill-current" /> 1st Stop
                                </span>
                              )}
                              {isPinnedSecond && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-sky-600 dark:text-sky-400 mb-1">
                                  <Star className="w-3 h-3 fill-current" /> 2nd Stop
                                </span>
                              )}
                              {!isPinned && techJobs.length > 1 && (
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
        techTimeOff={techTimeOff}
        onAddTimeOff={onAddTimeOff}
        onDeleteTimeOff={onDeleteTimeOff}
      />
    </div>
  );
};

export default Dashboard;
