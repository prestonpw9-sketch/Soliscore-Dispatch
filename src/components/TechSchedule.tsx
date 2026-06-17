import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, MapPin,
  HardHat, X, CalendarDays, ClipboardList, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Technician {
  id: string;
  name: string;
  role: string;
}

interface Job {
  id: number;
  title: string;
  customerName: string;
  location: string;
  status: string;
  phase: string;
  date: string;
  end_date: string | null;
  technician_id: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-slate-100 text-slate-500 border-slate-200',
};

const TECH_COLORS = [
  { barColor: 'bg-blue-600',    textColor: 'text-blue-700',    fadeBg: 'bg-blue-100',    borderColor: 'border-l-blue-600'    },
  { barColor: 'bg-emerald-600', textColor: 'text-emerald-700', fadeBg: 'bg-emerald-100', borderColor: 'border-l-emerald-600' },
  { barColor: 'bg-violet-600',  textColor: 'text-violet-700',  fadeBg: 'bg-violet-100',  borderColor: 'border-l-violet-600'  },
  { barColor: 'bg-orange-600',  textColor: 'text-orange-700',  fadeBg: 'bg-orange-100',  borderColor: 'border-l-orange-600'  },
  { barColor: 'bg-rose-600',    textColor: 'text-rose-700',    fadeBg: 'bg-rose-100',    borderColor: 'border-l-rose-600'    },
  { barColor: 'bg-teal-600',    textColor: 'text-teal-700',    fadeBg: 'bg-teal-100',    borderColor: 'border-l-teal-600'    },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function dayOfMonth(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDate();
}

export default function TechSchedule() {
  const [currentDate, setCurrentDate]             = useState(new Date());
  const [selectedWeekStart, setSelectedWeekStart] = useState<number | null>(null);
  const [technicians, setTechnicians]             = useState<Technician[]>([]);
  const [jobs, setJobs]                           = useState<Job[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [error, setError]                         = useState<string | null>(null);

  const panelRef   = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const year            = currentDate.getFullYear();
  const month           = currentDate.getMonth();
  const daysInMonth     = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const monthName       = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthLabel      = currentDate.toLocaleDateString('en-US', { month: 'long' });

  const blanks     = Array<null>(firstDayOfMonth).fill(null);
  const dayNums    = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const totalSlots = [...blanks, ...dayNums];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const monthEnd   = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      const [techRes, jobRes] = await Promise.all([
        supabase.from('technicians').select('id, name, role').order('name'),
        supabase.from('jobs')
          .select('id, title, customerName, location, status, phase, date, end_date, technician_id')
          .gte('date', monthStart)
          .lte('date', monthEnd),
      ]);

      if (techRes.error) { setError(techRes.error.message); setLoading(false); return; }
      if (jobRes.error)  { setError(jobRes.error.message);  setLoading(false); return; }

      setTechnicians(techRes.data ?? []);
      setJobs(jobRes.data ?? []);
      setLoading(false);
    }
    fetchData();
  }, [year, month]);

  const getJobsForDay = (day: number) =>
    jobs.filter(j => {
      const start = dayOfMonth(j.date);
      const end   = j.end_date ? dayOfMonth(j.end_date) : start;
      return day >= start && day <= end;
    });

  const closePanel = () => {
    setSelectedWeekStart(null);
    triggerRef.current?.focus();
    triggerRef.current = null;
  };

  useEffect(() => {
    if (selectedWeekStart === null) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedWeekStart]);

  useEffect(() => {
    if (selectedWeekStart !== null) setTimeout(() => panelRef.current?.focus(), 0);
  }, [selectedWeekStart]);

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-white border-b border-slate-200 shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Master Schedule</h1>
          <p className="text-slate-500 font-medium text-sm mt-1">Monthly forecasting &amp; commercial dispatch</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 rounded-xl p-1.5 border border-slate-200">
            <button type="button" onClick={prevMonth} aria-label="Previous month" className="p-2 hover:bg-white rounded-lg shadow-sm transition-all">
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="px-6 font-bold text-slate-800 flex items-center gap-2 text-lg w-48 justify-center">
              <CalendarDays className="w-5 h-5 text-indigo-600" aria-hidden="true" />
              {monthName}
            </div>
            <button type="button" onClick={nextMonth} aria-label="Next month" className="p-2 hover:bg-white rounded-lg shadow-sm transition-all">
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          <button type="button" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold transition-colors shadow-sm">
            <Plus className="w-5 h-5" aria-hidden="true" /> Schedule Job
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      )}

      {error && (
        <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
          Failed to load schedule: {error}
        </div>
      )}

      {!loading && !error && (
        <div className="flex-1 p-6 overflow-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-w-[800px] h-full min-h-[600px]">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {DAY_NAMES.map(d => (
                <div key={d} className="py-3 text-center text-xs font-black text-slate-500 uppercase tracking-widest border-r border-slate-100 last:border-0">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 flex-1 bg-slate-200 gap-px">
              {totalSlots.map((day, index) => {
                const jobsToday = day ? getJobsForDay(day) : [];
                const colPos    = index % 7;
                const weekStart = day !== null ? Math.max(1, day - colPos) : null;

                return (
                  <div
                    key={index}
                    role={day ? 'button' : undefined}
                    tabIndex={day ? 0 : undefined}
                    aria-label={day ? `View week of ${monthLabel} ${weekStart}` : undefined}
                    onClick={e => {
                      if (day && weekStart !== null) {
                        triggerRef.current = e.currentTarget as HTMLElement;
                        setSelectedWeekStart(weekStart);
                      }
                    }}
                    onKeyDown={e => {
                      if (day && weekStart !== null && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        triggerRef.current = e.currentTarget as HTMLElement;
                        setSelectedWeekStart(weekStart);
                      }
                    }}
                    className={`bg-white min-h-[120px] p-2 flex flex-col group ${day ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''}`}
                  >
                    {day && (
                      <>
                        <div className="font-bold text-slate-400 text-sm mb-2 px-1 group-hover:text-indigo-600 transition-colors">{day}</div>
                        <div className="flex flex-col gap-1 w-full overflow-hidden">
                          {jobsToday.map(job => {
                            const techIndex = technicians.findIndex(t => t.id === job.technician_id);
                            const colors    = TECH_COLORS[techIndex % TECH_COLORS.length] ?? TECH_COLORS[0];
                            const isStart   = day === dayOfMonth(job.date);
                            const isEnd     = day === (job.end_date ? dayOfMonth(job.end_date) : dayOfMonth(job.date));
                            return (
                              <div
                                key={job.id}
                                className={[
                                  'text-[10px] font-bold px-2 py-1.5 truncate',
                                  colors.fadeBg, colors.textColor,
                                  isStart ? `rounded-l-md border-l-4 ${colors.borderColor}` : '',
                                  isEnd   ? 'rounded-r-md shadow-sm' : '',
                                  !isStart && !isEnd ? 'border-y border-white/50' : '',
                                ].filter(Boolean).join(' ')}
                              >
                                {isStart ? (job.title || job.customerName) : '\u00A0'}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selectedWeekStart !== null && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" aria-hidden="true" onClick={closePanel} />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="week-panel-title"
            tabIndex={-1}
            className="relative w-full max-w-2xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden outline-none"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <h2 id="week-panel-title" className="text-xl font-black text-slate-900">Weekly Dispatch</h2>
                <p className="text-slate-500 font-medium text-sm mt-1">Week of {monthLabel} {selectedWeekStart}</p>
              </div>
              <button type="button" onClick={closePanel} aria-label="Close weekly view" className="p-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
              {technicians.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-12">No technicians on roster.</p>
              )}
              {technicians.map((tech, techIndex) => {
                const colors   = TECH_COLORS[techIndex % TECH_COLORS.length];
                const weekEnd  = selectedWeekStart + 6;
                const weekJobs = jobs.filter(j => {
                  if (j.technician_id !== tech.id) return false;
                  const start = dayOfMonth(j.date);
                  const end   = j.end_date ? dayOfMonth(j.end_date) : start;
                  return start <= weekEnd && end >= selectedWeekStart;
                });

                return (
                  <div key={tech.id} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className={`${colors.fadeBg} p-4 border-b border-slate-200 flex items-center gap-3`}>
                      <div className={`w-3 h-10 rounded-full ${colors.barColor}`} aria-hidden="true" />
                      <div>
                        <h3 className={`font-black text-lg ${colors.textColor}`}>{tech.name}</h3>
                        <p className={`text-xs font-bold opacity-70 flex items-center gap-1 ${colors.textColor}`}>
                          <HardHat className="w-3.5 h-3.5" aria-hidden="true" /> {tech.role}
                        </p>
                      </div>
                    </div>
                    <div className="bg-white p-4 flex flex-col gap-3">
                      {weekJobs.length === 0 ? (
                        <div className="text-center py-6 text-sm font-medium text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                          No assignments this week.
                        </div>
                      ) : (
                        weekJobs.map(job => (
                          <div key={job.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-indigo-300 transition-colors">
                            <div className="flex justify-between items-start mb-2 gap-2">
                              <h4 className="font-bold text-slate-900">{job.title || job.customerName}</h4>
                              <span className={`text-[10px] uppercase tracking-widest font-black px-2 py-1 rounded-md border shrink-0 ${STATUS_STYLES[job.status] ?? STATUS_STYLES.scheduled}`}>
                                {job.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm font-medium text-slate-600 mt-3">
                              <div className="flex items-center gap-2">
                                <CalendarDays className="w-4 h-4 text-blue-500" aria-hidden="true" />
                                {monthLabel} {dayOfMonth(job.date)}{job.end_date ? `–${dayOfMonth(job.end_date)}` : ''}
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                                {job.location || job.customerName}
                              </div>
                              {job.phase && (
                                <div className="flex items-start gap-2 col-span-2 pt-2 mt-1 border-t border-slate-200/60">
                                  <ClipboardList className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                                  <span className="text-slate-500 text-xs">{job.phase}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}