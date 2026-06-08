import React, { useState } from 'react';
import { Calendar, MapPin, HardHat, ChevronLeft, ChevronRight, Plus, ClipboardList } from 'lucide-react';

// --- Commercial / Project Mock Data ---
const CREWS = [
  { id: 'c1', name: 'Crew Alpha (Foreman: Alex M.)', size: 4, color: 'bg-blue-600' },
  { id: 'c2', name: 'Crew Beta (Foreman: Sarah J.)', size: 3, color: 'bg-emerald-600' },
];

const MOCK_PROJECTS = [
  { id: 'p1', crewId: 'c1', title: 'Sabino Underground Phase 1', dates: 'June 1 - June 4', location: 'Sabino Site', status: 'active', notes: 'Trenching & Main Lines' },
  { id: 'p2', crewId: 'c2', title: 'Mesa Commercial Rough-in', dates: 'June 3 - June 6', location: 'Mesa Office Park', status: 'scheduled', notes: 'Water dist & 3-Compartment Sinks' },
  { id: 'p3', crewId: 'c1', title: 'High-End Fixture Trim', dates: 'June 5', location: 'Downtown Suites', status: 'scheduled', notes: 'Setting Graff & Brizo components' },
];

export default function TechSchedule() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'completed': return 'bg-emerald-50 border-emerald-200 text-emerald-800';
      default: return 'bg-slate-50 border-slate-200 text-slate-700';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header Controls */}
      <div className="flex items-center justify-between p-6 bg-white border-b border-slate-200 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Crew & Project Schedule</h1>
          <p className="text-slate-500">Manage commercial phases and crew assignments</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button className="p-2 hover:bg-white rounded shadow-sm transition-all"><ChevronLeft className="w-5 h-5 text-slate-600" /></button>
            <div className="px-4 font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Week of {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            <button className="p-2 hover:bg-white rounded shadow-sm transition-all"><ChevronRight className="w-5 h-5 text-slate-600" /></button>
          </div>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm">
            <Plus className="w-5 h-5" /> Assign Crew
          </button>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6">
          {CREWS.map(crew => {
            const crewProjects = MOCK_PROJECTS.filter(p => p.crewId === crew.id);
            
            return (
              <div key={crew.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col xl:flex-row">
                
                {/* Crew Column */}
                <div className="xl:w-72 p-5 border-b xl:border-b-0 xl:border-r border-slate-100 bg-slate-50/50 flex flex-col shrink-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-3 h-10 rounded-full ${crew.color}`}></div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-900">{crew.name}</h3>
                      <p className="text-sm text-slate-500 font-medium flex items-center gap-1">
                        <HardHat className="w-4 h-4" /> {crew.size} Men
                      </p>
                    </div>
                  </div>
                </div>

                {/* Projects Row */}
                <div className="flex-1 p-5 flex flex-wrap gap-4 bg-slate-50">
                  {crewProjects.length === 0 ? (
                    <div className="text-slate-400 italic py-2 px-4">No active projects this week.</div>
                  ) : (
                    crewProjects.map(project => (
                      <div key={project.id} className={`flex-1 min-w-[300px] border-2 rounded-xl p-4 shadow-sm bg-white transition-colors hover:border-blue-300 ${getStatusColor(project.status)}`}>
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="font-black text-slate-800 text-lg leading-tight">{project.title}</h4>
                          <span className="text-[10px] uppercase tracking-widest font-black px-2 py-1 rounded-md bg-white border shadow-sm">
                            {project.status}
                          </span>
                        </div>
                        
                        <div className="space-y-2 text-sm font-medium text-slate-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-blue-500" /> {project.dates}
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-emerald-500" /> {project.location}
                          </div>
                          <div className="flex items-start gap-2 pt-2 mt-2 border-t border-slate-100">
                            <ClipboardList className="w-4 h-4 text-amber-500 mt-0.5" /> 
                            <span className="text-slate-500">{project.notes}</span>
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
  );
}