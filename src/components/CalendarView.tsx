import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import type { Job, Technician, JobType } from '@/lib/data';
import { dayNames, hours } from '@/lib/data';

interface Props {
  jobs: Job[];
  technicians: Technician[];
  weekDates: string[];
  onJobClick: (job: Job) => void;
  onJobDrop: (jobId: string, newDate: string, newStartHour: number) => void;
  onAssignTechnician?: (jobId: string, technicianId: string | null) => void;
  onEmptySlotClick?: (date: string, hour: number) => void;
}

const typeColors: Record<JobType, string> = {
  emergency:    'bg-red-500 border-red-600',
  maintenance:  'bg-teal-500 border-teal-600',
  installation: 'bg-emerald-500 border-emerald-600',
  inspection:   'bg-purple-500 border-purple-600',
};

const CalendarView: React.FC<Props> = ({
  jobs,
  technicians,
  weekDates,
  onJobClick,
  onJobDrop,
  onAssignTechnician,
  onEmptySlotClick,
}) => {
  const [techFilter, setTechFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [draggedJob, setDraggedJob] = useState<string | null>(null);

  const filteredJobs = jobs.filter(j => {
    if (techFilter !== 'all' && j.technicianId !== techFilter) return false;
    if (typeFilter !== 'all' && j.type !== typeFilter) return false;
    return true;
  });

  const formatDate = (dateStr: string) => new Date(dateStr).getDate();

  const isToday = (dateStr: string) =>
    dateStr === new Date().toISOString().split('T')[0];

  const monthYear = new Date(weekDates[0]).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {monthYear}
          </h2>
          <button className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            Today
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={techFilter}
            onChange={e => setTechFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-teal-500 outline-none"
          >
            <option value="all">All Technicians</option>
            {technicians.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-teal-500 outline-none"
          >
            <option value="all">All Types</option>
            <option value="emergency">Emergency</option>
            <option value="maintenance">Maintenance</option>
            <option value="installation">Installation</option>
            <option value="inspection">Inspection</option>
          </select>

          <div className="hidden md:flex items-center gap-3 ml-2 text-xs">
            {(Object.keys(typeColors) as JobType[]).map(t => (
              <span key={t} className="flex items-center gap-1 capitalize text-slate-600 dark:text-slate-400">
                <span className={`w-2.5 h-2.5 rounded-full ${typeColors[t].split(' ')[0]}`} />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="p-2 text-xs text-slate-500 font-medium" />
              {weekDates.map((date, i) => (
                <div
                  key={date}
                  className={`p-3 text-center border-l border-slate-200 dark:border-slate-800 ${
                    isToday(date) ? 'bg-teal-50 dark:bg-teal-900/20' : ''
                  }`}
                >
                  <div className="text-xs text-slate-500 font-medium">{dayNames[i]}</div>
                  <div
                    className={`text-lg font-bold mt-0.5 ${
                      isToday(date)
                        ? 'text-teal-600 dark:text-teal-400'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {formatDate(date)}
                  </div>
                </div>
              ))}
            </div>

            {hours.map(hour => (
              <div
                key={hour}
                className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-100 dark:border-slate-800/50 min-h-[64px]"
              >
                <div className="p-2 text-xs text-slate-500 font-medium border-r border-slate-200 dark:border-slate-800">
                  {hour > 12 ? `${hour - 12}p` : hour === 12 ? '12p' : `${hour}a`}
                </div>

                {weekDates.map(date => {
                  const cellJobs = filteredJobs.filter(
                    j => parseInt(j.startTime.split(':')[0]) === hour && j.date === date
                  );
                  return (
                    <div
                      key={date + hour}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => {
                        if (draggedJob) {
                          onJobDrop(draggedJob, date, hour);
                          setDraggedJob(null);
                        }
                      }}
                      onClick={e => {
                        if (e.target === e.currentTarget && onEmptySlotClick) {
                          onEmptySlotClick(date, hour);
                        }
                      }}
                      className={`border-l border-slate-200 dark:border-slate-800 p-1 relative cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                        isToday(date) ? 'bg-teal-50/30 dark:bg-teal-900/10' : ''
                      }`}
                    >
                      {cellJobs.map(job => {
                        const tech = technicians.find(t => t.id === job.technicianId);
                        const startH = parseInt(job.startTime.split(':')[0]);
                        const startM = parseInt(job.startTime.split(':')[1]);
                        const endH = parseInt(job.endTime.split(':')[0]);
                        const endM = parseInt(job.endTime.split(':')[1]);
                        const durationMin = endH * 60 + endM - (startH * 60 + startM);
                        const heightPx = Math.max(28, (durationMin / 60) * 64 - 4);
                        const colorClass = typeColors[job.type] ?? 'bg-slate-500 border-slate-600';
                        return (
                          <div
                            key={job.id}
                            draggable
                            onDragStart={() => setDraggedJob(job.id)}
                            onClick={() => onJobClick(job)}
                            className={`${colorClass} text-white text-xs rounded-md p-1.5 mb-1 cursor-pointer hover:opacity-90 border-l-4 shadow-sm`}
                            style={{ minHeight: heightPx }}
                            title={`${job.customerName} - ${job.description ?? ''}`}
                          >
                            <div className="font-semibold truncate">
                              {job.startTime} {job.customerName}
                            </div>
                            {onAssignTechnician ? (
                              <select
                                aria-label={`Assign plumber to ${job.customerName}`}
                                value={job.technicianId ?? ''}
                                draggable={false}
                                onClick={e => e.stopPropagation()}
                                onMouseDown={e => e.stopPropagation()}
                                onDragStart={e => e.stopPropagation()}
                                onChange={e => {
                                  e.stopPropagation();
                                  onAssignTechnician(job.id, e.target.value || null);
                                }}
                                className="mt-1 w-full bg-white/20 hover:bg-white/30 text-white text-[10px] font-medium rounded px-1 py-0.5 outline-none cursor-pointer border border-white/30 [&>option]:text-slate-900"
                              >
                                <option value="">Unassigned</option>
                                {technicians.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            ) : (
                              <div className="opacity-90 truncate text-[10px]">
                                {tech?.name}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;