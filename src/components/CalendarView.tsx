import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, Users, Check } from 'lucide-react';
import type { Job, Technician, JobType } from '@/lib/data';
import { dayNames, hours } from '@/lib/data';

interface Props {
  jobs: Job[];
  technicians: Technician[];
  weekDates: string[];
  onJobClick: (job: Job) => void;
  onJobDrop: (jobId: string, newDate: string, newStartHour: number) => void;
  onAssignTechnician?: (jobId: string, technicianId: string | null) => void;
  onAssignCrew?: (jobId: string, technicianIds: string[]) => void;
  onEmptySlotClick?: (date: string, hour: number) => void;
}

const typeColors: Record<JobType, string> = {
  emergency:    'bg-red-500 border-red-600',
  maintenance:  'bg-teal-500 border-teal-600',
  installation: 'bg-emerald-500 border-emerald-600',
  inspection:   'bg-purple-500 border-purple-600',
};

const initials = (name: string) =>
  name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

// Resolve a job's assigned crew, falling back to the legacy single id.
function crewIds(job: Job): string[] {
  const ids = job.technicianIds ?? [];
  if (ids.length) return ids;
  return job.technicianId ? [job.technicianId] : [];
}

// Inline checkbox popover for assigning multiple crew to one job block.
const CrewPicker: React.FC<{
  job: Job;
  technicians: Technician[];
  onAssignCrew: (jobId: string, technicianIds: string[]) => void;
}> = ({ job, technicians, onAssignCrew }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = crewIds(job);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter(x => x !== id)
      : [...selected, id];
    onAssignCrew(job.id, next);
  };

  const assignedTechs = technicians.filter(t => selected.includes(t.id));

  return (
    <div ref={wrapRef} className="relative mt-1" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        draggable={false}
        onMouseDown={e => e.stopPropagation()}
        onDragStart={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        aria-label={`Assign crew to ${job.customerName}`}
        className="w-full flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white rounded px-1 py-0.5 border border-white/30 transition-colors"
      >
        {assignedTechs.length > 0 ? (
          <span className="flex items-center -space-x-1">
            {assignedTechs.slice(0, 3).map(t => (
              <span
                key={t.id}
                title={t.name}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/90 text-slate-800 text-[8px] font-bold border border-white"
              >
                {initials(t.name)}
              </span>
            ))}
            {assignedTechs.length > 3 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-900/70 text-white text-[8px] font-bold border border-white">
                +{assignedTechs.length - 3}
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-medium">
            <Users className="w-3 h-3" /> Assign crew
          </span>
        )}
        <span className="ml-auto text-[9px] font-semibold opacity-80">
          {assignedTechs.length > 0 ? `${assignedTechs.length}` : ''}
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 left-0 w-48 max-h-52 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 text-slate-800 dark:text-slate-100">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-700/60">
            Assign crew ({selected.length})
          </div>
          {technicians.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">No technicians.</p>
          ) : (
            technicians.map(t => {
              const checked = selected.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={e => { e.stopPropagation(); toggle(t.id); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
                      checked
                        ? 'bg-teal-600 border-teal-600 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {checked && <Check className="w-3 h-3" />}
                  </span>
                  <span className="truncate">{t.name}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

const CalendarView: React.FC<Props> = ({
  jobs,
  technicians,
  weekDates,
  onJobClick,
  onJobDrop,
  onAssignTechnician,
  onAssignCrew,
  onEmptySlotClick,
}) => {
  const [techFilter, setTechFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [draggedJob, setDraggedJob] = useState<string | null>(null);

  const filteredJobs = jobs.filter(j => {
    if (techFilter !== 'all' && !crewIds(j).includes(techFilter)) return false;
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
                        const assigned = crewIds(job);
                        const assignedNames = technicians
                          .filter(t => assigned.includes(t.id))
                          .map(t => t.name);
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
                            {onAssignCrew ? (
                              <CrewPicker
                                job={job}
                                technicians={technicians}
                                onAssignCrew={onAssignCrew}
                              />
                            ) : onAssignTechnician ? (
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
                                {assignedNames.join(', ') || 'Unassigned'}
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