import React, { useState } from 'react';
import {
  Columns3, CalendarRange, Users, CalendarDays,
} from 'lucide-react';
import type { Job, Technician, TechTimeOff } from '@/lib/data';
import ScheduleBoard from '@/components/ScheduleBoard';
import MasterBoard from '@/components/schedule/MasterBoard';
import CrewBoard from '@/components/schedule/CrewBoard';
import MilestoneCalendar from '@/components/schedule/MilestoneCalendar';

export type ScheduleTab = 'master' | 'timeline' | 'crew' | 'calendar';

const TABS: { key: ScheduleTab; label: string; short: string; icon: typeof Columns3 }[] = [
  { key: 'master',   label: 'Master Board', short: 'Master',   icon: Columns3 },
  { key: 'timeline', label: 'Timeline',     short: 'Timeline', icon: CalendarRange },
  { key: 'crew',     label: 'Crew View',    short: 'Crew',     icon: Users },
  { key: 'calendar', label: 'Calendar',     short: 'Calendar', icon: CalendarDays },
];

interface Props {
  jobs: Job[];
  technicians: Technician[];
  techTimeOff?: TechTimeOff[];
  onRefresh: () => Promise<void> | void;
  /** When opening Schedule from Dashboard calendar link, land on this tab. */
  initialTab?: ScheduleTab;
}

const MultiJobBoard: React.FC<Props> = ({
  jobs,
  technicians,
  techTimeOff = [],
  onRefresh,
  initialTab = 'master',
}) => {
  const [tab, setTab] = useState<ScheduleTab>(initialTab);
  const [focusJobId, setFocusJobId] = useState<string | null>(null);

  const openTimelineForJob = (jobId: string) => {
    setFocusJobId(jobId);
    setTab('timeline');
  };

  return (
    <div className="space-y-3">
      {/* Sticky tab strip — large tap targets for crew phones */}
      <div className="sticky top-0 z-20 -mx-1 px-1 py-1 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-800">
        <div
          className="flex gap-1 overflow-x-auto scrollbar-thin pb-0.5"
          role="tablist"
          aria-label="Schedule views"
        >
          {TABS.map(({ key, label, short, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(key)}
                className={`shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'master' && (
        <MasterBoard
          jobs={jobs}
          technicians={technicians}
          onRefresh={onRefresh}
          onOpenJob={openTimelineForJob}
        />
      )}

      {tab === 'timeline' && (
        <ScheduleBoard
          jobs={jobs}
          technicians={technicians}
          techTimeOff={techTimeOff}
          onRefresh={onRefresh}
          focusJobId={focusJobId}
        />
      )}

      {tab === 'crew' && (
        <CrewBoard
          jobs={jobs}
          technicians={technicians}
          techTimeOff={techTimeOff}
          onOpenJob={openTimelineForJob}
        />
      )}

      {tab === 'calendar' && (
        <MilestoneCalendar
          jobs={jobs}
          onRefresh={onRefresh}
          onOpenJob={openTimelineForJob}
        />
      )}
    </div>
  );
};

export default MultiJobBoard;
