import React, { useState } from 'react';
import { X, UserPlus, Trash2, Briefcase } from 'lucide-react';
import type { Technician, Job } from '@/lib/data';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  technicians: Technician[];
  todayJobs: Job[];
  onHire: (name: string, role: string) => void;
  onFire: (id: string) => void;
}

const TeamModal: React.FC<Props> = ({ isOpen, onClose, technicians, todayJobs, onHire, onFire }) => {
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Plumber');

  if (!isOpen) return null;

  const handleHire = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onHire(newName.trim(), newRole);
    setNewName('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-black text-slate-900 dark:text-white">Active Roster & Dispatch</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* The Roster List */}
        <div className="overflow-y-auto p-5 space-y-4 flex-grow">
          {technicians.map(tech => {
            const techJobs = todayJobs.filter(j => j.technicianId === tech.id);
            
            return (
              <div key={tech.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col md:flex-row gap-4 justify-between md:items-center">
                
                {/* Tech Info */}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg">{tech.name}</h3>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${tech.role === 'Plumber' ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'}`}>
                      {tech.role}
                    </span>
                  </div>
                  
                  {/* Today's Assigned Jobs */}
                  <div className="mt-2 space-y-1">
                    {techJobs.length === 0 ? (
                      <p className="text-sm text-slate-500 flex items-center gap-1"><Briefcase className="w-3 h-3"/> No jobs scheduled today</p>
                    ) : (
                      techJobs.map(job => (
                        <p key={job.id} className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          <Briefcase className="w-3 h-3 text-indigo-500"/> {job.customerName} ({job.phase})
                        </p>
                      ))
                    )}
                  </div>
                </div>

                {/* Fire Button */}
                <button 
                  onClick={() => { if(window.confirm(`Are you sure you want to remove ${tech.name} from the roster?`)) onFire(tech.id); }}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors shrink-0 self-start md:self-center"
                  title="Remove from roster"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Hire Form (Footer) */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <form onSubmit={handleHire} className="flex gap-3">
            <input 
              type="text" 
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New hire name..." 
              className="flex-grow bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <select 
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="Plumber">Plumber</option>
              <option value="Apprentice">Apprentice</option>
            </select>
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors">
              <UserPlus className="w-4 h-4" /> Add
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default TeamModal;