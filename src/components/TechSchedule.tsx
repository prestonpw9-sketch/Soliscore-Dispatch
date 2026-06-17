

import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, MapPin,
  HardHat, X, CalendarDays, ClipboardList,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface Crew {
  id: string;
  name: string;
  size: number;
  // FIX: static class strings — no dynamic Tailwind construction
  barColor: string;   // e.g. 'bg-blue-600'
  textColor: string;  // e.g. 'text-blue-700'
  fadeBg: string;     // e.g. 'bg-blue-100'
  borderColor: string; // e.g. 'border-l-blue-600'
}

interface Project {
  id: string;
  crewId: string;
  title: string;
  startDay: number;
  endDay: number;
  location: string;
  status: 'active' | 'scheduled' | 'completed';
  notes: string;
}

// ── Static data ────────────────────────────────────────────────────────────

// FIX: all Tailwind classes must be full static strings — the JIT scanner
// cannot detect `'bg-' + colorName + '-600'` and will strip the class.
const CREWS: Crew[] = [
  {
    id: 'c1',
    name: 'Crew Alpha (Foreman: Alex M.)',
    size: 4,
    barColor: 'bg-blue-600',
    textColor: 'text-blue-700',
    fadeBg: 'bg-blue-100',
    borderColor: 'border-l-blue-600',
  },
  {
    id: 'c2',
    name: 'Crew Beta (Foreman: Sarah J.)',
    size: 3,
    barColor: 'bg-emerald-600',
    textColor: 'text-emerald-700',
    fadeBg: 'bg-emerald-100',
    borderColor: 'border-l-emerald-600',
  },
];

const MOCK_PROJECTS: Project[] = [
  { id: 'p1', crewId: 'c1', title: 'Sabino Underground Phase 1', startDay: 2,  endDay: 5,  location: 'Sabino Site',      status: 'active',    notes: 'Trenching & Main Lines' },
  { id: 'p2', crewId: 'c2', title: 'Mesa Commercial Rough-in',   startDay: 12, endDay: 15, location: 'Mesa Office Park',  status: 'scheduled', notes: 'Water dist & Sinks' },
  { id: 'p3', crewId: 'c1', title: 'High-End Fixture Trim',      startDay: 22, endDay: 22, location: 'Downtown Suites',  status: 'scheduled', notes: 'Setting Graff components' },
  { id: 'p4', crewId: 'c2', title: 'Emergency Main Break',       startDay: 8,  endDay: 8,  location: 'Vail Warehouse',   status: 'completed', notes: 'Repaired 4" main' },
];

const STATUS_STYLES: Record<Project['status'], string> = {
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-slate-100 text-slate-500 border-slate-200',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ── Component ──────────────────────────────────────────────────────────────

export default function TechSchedule() {
  const [currentDate, setCurrentDate]         = useState(new Date(2026, 5, 1));
  const [selectedWeekStart, setSelectedWeekStart] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const year       = currentDate.getFullYear();
  const month      = currentDate.getMonth();
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const monthName  = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long' });

  // Blank leading cells + day numbers
  const blanks   = Array<null>(firstDayOfMonth).fill(null);
  const dayNums  = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const totalSlots = [...blanks, ...dayNums];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getProjectsForDay = (day: number) =>
    MOCK_PROJECTS.filter(p => day >= p.startDay && day <= p.endDay);

  // Escape to close slide-out
  useEffect(() => {
    if (selectedWeekStart === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedWeekStart(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedWeekStart]);

  // Focus panel when it opens
  useEffect(() => {
    if (selectedWeekStart !== null) {
      setTimeout(() => panelRef.current?.focus(), 0);
    }
  }, [selectedWeekStart]);

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-white border-b border-slate-200 shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Master Schedule</h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Monthly forecasting &amp; commercial dispatch
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 rounded-xl p-1.5 border border-slate-200">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className="p-2 hover:bg-white rounded-lg shadow-sm transition-all"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="px-6 font-bold text-slate-800 flex items-center gap-2 text-lg w-48 justify-center">
              <CalendarDays className="w-5 h-5 text-indigo-600" aria-hidden="true" />
              {monthName}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className="p-2 hover:bg-white rounded-lg shadow-sm transition-all"
            >
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <button
            type="button"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" aria-hidden="true" /> Schedule Crew
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-w-[800px] h-full min-h-[600px]">

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {DAY_NAMES.map(d => (
              <div
                key={d}
                className="py-3 text-center text-xs font-black text-slate-500 uppercase tracking-widest border-r border-slate-100 last:border-0"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="grid grid-cols-7 flex-1 bg-slate-200 gap-px">
            {totalSlots.map((day, index) => {
              const projectsToday = day ? getProjectsForDay(day) : [];

              // FIX: week start = day minus its column position (index % 7)
              // blanks count as columns, so this correctly gives the Sunday of that row.
              // When day is null (blank cell), weekStart is also null.
              const colPos = index % 7;
              const weekStart = day !== null ? day - colPos : null;

              return (
                <div
                  key={index}
                  role={day ? 'button' : undefined}
                  tabIndex={day ? 0 : undefined}
                  aria-label={day ? `View week of ${monthLabel} ${weekStart}` : undefined}
                  onClick={() => day && weekStart !== null && setSelectedWeekStart(weekStart)}
                  onKeyDown={e => {
                    if (day && weekStart !== null && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      setSelectedWeekStart(weekStart);
                    }
                  }}
                  className={`bg-white min-h-[120px] p-2 flex flex-col group ${
                    day ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''
                  }`}
                >
                  {day && (
                    <>
                      <div className="font-bold text-slate-400 text-sm mb-2 px-1 group-hover:text-indigo-600 transition-colors">
                        {day}
                      </div>
                      <div className="flex flex-col gap-1 w-full overflow-hidden">
                        {projectsToday.map(project => {
                          const crew    = CREWS.find(c => c.id === project.crewId);
                          const isStart = day === project.startDay;
                          const isEnd   = day === project.endDay;

                          // FIX: full static class strings — no string interpolation
                          return (
                            <div
                              key={project.id}
                              className={[
                                'text-[10px] font-bold px-2 py-1.5 truncate',
                                crew?.fadeBg,
                                crew?.textColor,
                                isStart ? `rounded-l-md border-l-4 ${crew?.borderColor}` : '',
                                isEnd   ? 'rounded-r-md shadow-sm' : '',
                                !isStart && !isEnd ? 'border-y border-white/50' : '',
                              ].filter(Boolean).join(' ')}
                            >
                              {isStart ? project.title : '\u00A0'}
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

      {/* Slide-out panel */}
      {selectedWeekStart !== null && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            aria-hidden="true"
            onClick={() => setSelectedWeekStart(null)}
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="week-panel-title"
            tabIndex={-1}
            className="relative w-full max-w-2xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right overflow-hidden outline-none"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <h2 id="week-panel-title" className="text-xl font-black text-slate-900">
                  Weekly Crew Deployment
                </h2>
                <p className="text-slate-500 font-medium text-sm mt-1">
                  Week of {monthLabel} {selectedWeekStart}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWeekStart(null)}
                aria-label="Close weekly view"
                className="p-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
              {CREWS.map(crew => {
                const weekEnd = selectedWeekStart + 6;
                const weekProjects = MOCK_PROJECTS.filter(
                  p => p.crewId === crew.id &&
                       p.startDay <= weekEnd &&
                       p.endDay   >= selectedWeekStart
                );

                return (
                  <div key={crew.id} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className={`${crew.fadeBg} p-4 border-b border-slate-200 flex items-center justify-between`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-10 rounded-full ${crew.barColor}`} aria-hidden="true" />
                        <div>
                          <h3 className={`font-black text-lg ${crew.textColor}`}>{crew.name}</h3>
                          <p className={`text-xs font-bold opacity-70 flex items-center gap-1 ${crew.textColor}`}>
                            <HardHat className="w-3.5 h-3.5" aria-hidden="true" /> {crew.size} Men Active
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 flex flex-col gap-3">
                      {weekProjects.length === 0 ? (
                        <div className="text-center py-6 text-sm font-medium text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                          No assignments this week.
                        </div>
                      ) : (
                        weekProjects.map(project => (
                          <div
                            key={project.id}
                            className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-indigo-300 transition-colors"
                          >
                            <div className="flex justify-between items-start mb-2 gap-2">
                              <h4 className="font-bold text-slate-900">{project.title}</h4>
                              {/* FIX: static status styles via lookup map */}
                              <span className={`text-[10px] uppercase tracking-widest font-black px-2 py-1 rounded-md border shrink-0 ${STATUS_STYLES[project.status]}`}>
                                {project.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm font-medium text-slate-600 mt-3">
                              <div className="flex items-center gap-2">
                                <CalendarDays className="w-4 h-4 text-blue-500" aria-hidden="true" />
                                {monthLabel} {project.startDay}–{project.endDay}
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                                {project.location}
                              </div>
                              <div className="flex items-start gap-2 col-span-2 pt-2 mt-1 border-t border-slate-200/60">
                                <ClipboardList className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                                <span className="text-slate-500 text-xs">{project.notes}</span>
                              </div>
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