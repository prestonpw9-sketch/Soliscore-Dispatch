import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, MapPin, HardHat, X, CalendarDays, ClipboardList } from 'lucide-react';

// --- MOCK DATA (Updated with actual date tracking) ---
const CREWS = [
  { id: 'c1', name: 'Crew Alpha (Foreman: Alex M.)', size: 4, color: 'bg-blue-600', text: 'text-blue-700', bgFade: 'bg-blue-100' },
  { id: 'c2', name: 'Crew Beta (Foreman: Sarah J.)', size: 3, color: 'bg-emerald-600', text: 'text-emerald-700', bgFade: 'bg-emerald-100' },
];

const MOCK_PROJECTS = [
  { id: 'p1', crewId: 'c1', title: 'Sabino Underground Phase 1', startDay: 2, endDay: 5, location: 'Sabino Site', status: 'active', notes: 'Trenching & Main Lines' },
  { id: 'p2', crewId: 'c2', title: 'Mesa Commercial Rough-in', startDay: 12, endDay: 15, location: 'Mesa Office Park', status: 'scheduled', notes: 'Water dist & Sinks' },
  { id: 'p3', crewId: 'c1', title: 'High-End Fixture Trim', startDay: 22, endDay: 22, location: 'Downtown Suites', status: 'scheduled', notes: 'Setting Graff components' },
  { id: 'p4', crewId: 'c2', title: 'Emergency Main Break', startDay: 8, endDay: 8, location: 'Vail Warehouse', status: 'completed', notes: 'Repaired 4" main' },
];

export default function TechSchedule() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 1)); // Defaulting to June 2026 for mock data
  const [selectedWeekStart, setSelectedWeekStart] = useState<number | null>(null);

  // Calendar Math
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Generate blank squares for the start of the month
  const blanks = Array(firstDayOfMonth).fill(null);
  // Generate actual days
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const totalSlots = [...blanks, ...days];

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

  // Find projects active on a specific day
  const getProjectsForDay = (day: number) => {
    return MOCK_PROJECTS.filter(p => day >= p.startDay && day <= p.endDay);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      
      {/* HEADER CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-white border-b border-slate-200 shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Master Schedule</h1>
          <p className="text-slate-500 font-medium text-sm mt-1">Monthly forecasting & commercial dispatch</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 rounded-xl p-1.5 border border-slate-200">
            <button onClick={prevMonth} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all"><ChevronLeft className="w-5 h-5 text-slate-600" /></button>
            <div className="px-6 font-bold text-slate-800 flex items-center gap-2 text-lg w-48 justify-center">
              <CalendarDays className="w-5 h-5 text-indigo-600" />
              {monthName}
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all"><ChevronRight className="w-5 h-5 text-slate-600" /></button>
          </div>
          <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold transition-colors shadow-sm">
            <Plus className="w-5 h-5" /> Schedule Crew
          </button>
        </div>
      </div>

      {/* FULL MONTHLY CALENDAR GRID */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-w-[800px] h-full min-h-[600px]">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="py-3 text-center text-xs font-black text-slate-500 uppercase tracking-widest border-r border-slate-100 last:border-0">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Squares */}
          <div className="grid grid-cols-7 flex-1 bg-slate-200 gap-px">
            {totalSlots.map((day, index) => {
              const projectsToday = day ? getProjectsForDay(day) : [];
              // Determine if this is the start of a week row to trigger the overlay
              const weekStartDay = day ? day - (index % 7) : null;

              return (
                <div 
                  key={index} 
                  onClick={() => day && setSelectedWeekStart(weekStartDay)}
                  className={`bg-white min-h-[120px] p-2 flex flex-col group ${day ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''}`}
                >
                  {day && (
                    <>
                      <div className="font-bold text-slate-400 text-sm mb-2 px-1 group-hover:text-indigo-600 transition-colors">
                        {day}
                      </div>
                      <div className="flex flex-col gap-1 w-full overflow-hidden">
                        {projectsToday.map(project => {
                          const crew = CREWS.find(c => c.id === project.crewId);
                          // Determine if this is the first day of the visual bar
                          const isStart = day === project.startDay;
                          const isEnd = day === project.endDay;
                          
                          return (
                            <div 
                              key={project.id} 
                              className={`text-[10px] font-bold px-2 py-1.5 truncate ${crew?.bgFade} ${crew?.text} 
                                ${isStart ? 'rounded-l-md border-l-4 border-l-' + crew?.color.split('-')[1] + '-600' : ''} 
                                ${isEnd ? 'rounded-r-md shadow-sm' : ''} 
                                ${!isStart && !isEnd ? 'border-y border-white/50' : ''}`}
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

      {/* THE WEEKLY OVERLAY (SLIDE-OUT PANEL) */}
      {selectedWeekStart && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Dark backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedWeekStart(null)}
          ></div>
          
          {/* Sliding Panel */}
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50">
              <div>
                <h2 className="text-xl font-black text-slate-900">Weekly Crew Deployment</h2>
                <p className="text-slate-500 font-medium text-sm mt-1">
                  Week of {monthName.split(' ')[0]} {selectedWeekStart}
                </p>
              </div>
              <button 
                onClick={() => setSelectedWeekStart(null)}
                className="p-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
              {CREWS.map(crew => {
                // Find projects for this crew that fall in this week
                const weekProjects = MOCK_PROJECTS.filter(p => 
                  p.crewId === crew.id && 
                  (p.startDay <= selectedWeekStart + 6 && p.endDay >= selectedWeekStart)
                );

                return (
                  <div key={crew.id} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className={`${crew.bgFade} p-4 border-b border-slate-200 flex items-center justify-between`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-10 rounded-full ${crew.color}`}></div>
                        <div>
                          <h3 className={`font-black text-lg ${crew.text}`}>{crew.name}</h3>
                          <p className={`text-xs font-bold opacity-70 flex items-center gap-1 ${crew.text}`}>
                            <HardHat className="w-3.5 h-3.5" /> {crew.size} Men Active
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white p-4 flex flex-col gap-3">
                      {weekProjects.length === 0 ? (
                        <div className="text-center py-6 text-sm font-medium text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                          No assignments for this week.
                        </div>
                      ) : (
                        weekProjects.map(project => (
                          <div key={project.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-indigo-300 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-bold text-slate-900">{project.title}</h4>
                              <span className="text-[10px] uppercase tracking-widest font-black px-2 py-1 rounded-md bg-white border border-slate-200 shadow-sm text-slate-600">
                                {project.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm font-medium text-slate-600 mt-3">
                              <div className="flex items-center gap-2">
                                <CalendarDays className="w-4 h-4 text-blue-500" /> 
                                {monthName.split(' ')[0]} {project.startDay} - {project.endDay}
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-emerald-500" /> {project.location}
                              </div>
                              <div className="flex items-start gap-2 col-span-2 pt-2 mt-1 border-t border-slate-200/60">
                                <ClipboardList className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /> 
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