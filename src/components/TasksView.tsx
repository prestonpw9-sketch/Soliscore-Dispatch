import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import type { Job, Technician } from '@/lib/data';

interface Props {
  jobs: Job[];
  technicians: Technician[];
  onToggleStatus: (jobId: string) => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  weekDates: string[];
}

const TasksView: React.FC<Props> = ({ jobs, technicians, onToggleStatus, selectedDate, onDateChange, weekDates }) => {
  const dailyJobs = jobs.filter(j => j.date === selectedDate);

  return (
    <div className="space-y-4 w-full">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {weekDates.map(d => {
          const formatted = new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          return (
            <button 
              key={d} 
              onClick={() => onDateChange(d)} 
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${selectedDate === d ? 'bg-teal-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
            >
              {formatted}
            </button>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {technicians.map(t => {
          const techJobs = dailyJobs.filter(j => j.technicianId === t.id).sort((a, b) => a.startTime.localeCompare(b.startTime));
          if (techJobs.length === 0) return null;
          
          const progress = Math.round((techJobs.filter(j => j.status === 'completed').length / techJobs.length) * 100);

          return (
            <div key={t.id} className="card bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
                <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">{t.name}'s Route</h3>
                <span className="text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-1 rounded-md">{progress}% Done</span>
              </div>
              <div className="space-y-2">
                {techJobs.map(job => (
                  <div key={job.id} onClick={() => onToggleStatus(job.id)} className="flex items-start gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors group">
                    <div className="shrink-0 mt-0.5">
                      {job.status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-teal-400 transition-colors" />
                      )}
                    </div>
                    <div>
                      <div className={`font-medium text-sm transition-all ${job.status === 'completed' ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200'}`}>
                        {job.customerName}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {job.startTime} • {job.type}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {dailyJobs.length === 0 && (
          <div className="col-span-full p-8 text-center text-slate-500 text-sm card bg-white dark:bg-slate-900">
            No jobs scheduled for this date.
          </div>
        )}
      </div>
    </div>
  );
};

export default TasksView;