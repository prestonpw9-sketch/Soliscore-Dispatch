import React from 'react';
import { Briefcase, Map, Camera, CheckCircle2, TrendingUp } from 'lucide-react';

interface Props {
  jobsToday: number;
  activeBlueprints: number;
  completedThisWeek: number;
  sitePhotos: number;
  completionRate: number;
}

const StatsCards: React.FC<Props> = ({ jobsToday, activeBlueprints, completedThisWeek, sitePhotos, completionRate }) => {
  // We've shifted from full-card gradients to ultra-clean badge accents with mock trend data
  const cards = [
    { 
      label: "Today's Jobs", 
      value: jobsToday, 
      icon: Briefcase, 
      colorText: 'text-indigo-600 dark:text-indigo-400', 
      colorBg: 'bg-indigo-50 dark:bg-indigo-500/10',
      trend: 'Live'
    },
    { 
      label: 'Active Blueprints', 
      value: activeBlueprints, 
      icon: Map, 
      colorText: 'text-blue-600 dark:text-blue-400', 
      colorBg: 'bg-blue-50 dark:bg-blue-500/10',
      trend: 'Synced'
    },
    { 
      label: 'Site Photos', 
      value: sitePhotos, 
      icon: Camera, 
      colorText: 'text-emerald-600 dark:text-emerald-400', 
      colorBg: 'bg-emerald-50 dark:bg-emerald-500/10',
      trend: 'Updating'
    },
    { 
      label: 'Weekly Completed', 
      value: completedThisWeek, 
      icon: CheckCircle2, 
      colorText: 'text-teal-600 dark:text-teal-400', 
      colorBg: 'bg-teal-50 dark:bg-teal-500/10',
      trend: 'On Track'
    },
    { 
      label: 'Completion Rate', 
      value: `${completionRate}%`, 
      icon: TrendingUp, 
      colorText: 'text-purple-600 dark:text-purple-400', 
      colorBg: 'bg-purple-50 dark:bg-purple-500/10',
      trend: 'Metric'
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
      {cards.map((c) => (
        <div 
          key={c.label} 
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group cursor-default flex flex-col justify-between"
        >
          {/* Top Row: Icon Badge & Trend Indicator */}
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${c.colorBg} transition-transform group-hover:scale-110`}>
              <c.icon className={`w-5 h-5 ${c.colorText}`} />
            </div>
            <span className="flex items-center text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {c.trend}
            </span>
          </div>
          
          {/* Bottom Row: Core Data */}
          <div>
            <h4 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
              {c.value}
            </h4>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-2">
              {c.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsCards;