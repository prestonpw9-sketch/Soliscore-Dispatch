import React from 'react';
import { CheckCircle2, Circle, CalendarDays, Map, RouteOff } from 'lucide-react';
import type { Job, Technician, JobType } from '@/lib/data';

interface Props {
  jobs: Job[];
  technicians: Technician[];
  onToggleStatus: (jobId: string) => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  weekDates: string[];
}

const typeColors: Record<JobType, string> = {
  emergency: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200',
  maintenance: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200',
  installation: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200',
  inspection: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200',
};

const TasksView: React.FC<Props> = ({
  jobs,
  technicians,
  onToggleStatus,
  selectedDate,
  onDateChange,
  weekDates,
}) => {
  const dailyJobs = jobs.filter(j => j.date === selectedDate);

  // A job belongs to a tech if it's in the multi-crew array, or (legacy) the
  // single technicianId matches.
  const jobHasTech = (job: Job, techId: string) =>
    (job.technicianIds?.includes(techId) ?? false) || job.technicianId === techId;

  return (
    <div className="space-y-6 w-full">
      <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-2 overflow-x-auto custom-scrollbar">
        <div className="px-4 border-r border-slate-200 dark:border-slate-800 flex items-center gap-2 text-slate-500 shrink-0 font-bold">
          <CalendarDays className="w-5 h-5" />
          <span>Active Routes</span>
        </div>

        {weekDates.map(d => {
          const isSelected = selectedDate === d;
          const dateObj = new Date(d);
          const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
          const dayNum = dateObj.toLocaleDateString('en-US', { day: 'numeric' });

          return (
            <button
              key={d}
              onClick={() => onDateChange(d)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className={isSelected ? 'opacity-80 text-xs' : 'text-slate-400 text-xs'}>
                {dayName}
              </span>
              <span>{dayNum}</span>
            </button>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        {technicians.map(t => {
          const techJobs = dailyJobs
            .filter(j => jobHasTech(j, t.id))
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

          if (techJobs.length === 0) return null;

          const completedCount = techJobs.filter(j => j.status === 'completed').length;
          const progress = Math.round((completedCount / techJobs.length) * 100);

          return (
            <div
              key={t.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-black text-lg border border-indigo-200 dark:border-indigo-800/50">
                    {t.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white leading-tight">
                      {t.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                      <Map className="w-3 h-3" /> {techJobs.length} Stops
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-slate-900 dark:text-white">
                      {progress}%
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full transition-all duration-700 ease-out rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="p-2 space-y-1 flex-1 bg-white dark:bg-slate-900">
                {techJobs.map(job => {
                  const isDone = job.status === 'completed';
                  const jobTypeClass = typeColors[job.type];

                  return (
                    <div
                      key={job.id}
                      onClick={() => onToggleStatus(job.id)}
                      className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all border border-transparent ${
                        isDone
                          ? 'opacity-60 hover:opacity-100 bg-slate-50 dark:bg-slate-800/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="shrink-0 mt-1 transition-transform active:scale-90">
                        {isDone ? (
                          <CheckCircle2 className="w-6 h-6 text-indigo-600 dark:text-indigo-500" />
                        ) : (
                          <Circle className="w-6 h-6 text-slate-300 dark:text-slate-600 hover:text-indigo-400 transition-colors" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div
                          className={`font-bold text-sm truncate transition-all ${
                            isDone
                              ? 'line-through text-slate-500'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {job.customerName}
                        </div>

                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                            {job.startTime}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border ${jobTypeClass}`}
                          >
                            {job.type}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {dailyJobs.length === 0 && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <RouteOff className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              No Routes Active
            </h3>
            <p className="text-slate-500 max-w-sm mt-1">
              There are no field assignments scheduled for{' '}
              {new Date(selectedDate).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TasksView;