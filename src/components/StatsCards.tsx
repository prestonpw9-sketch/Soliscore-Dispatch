import React from 'react';
import { Briefcase, Map, Camera, CheckCircle2, TrendingUp } from 'lucide-react';

interface Props {
  jobsToday: number;
  activeBlueprints: number; // <-- Cleaned up!
  completedThisWeek: number;
  sitePhotos: number;       // <-- Cleaned up!
  completionRate: number;
}

const StatsCards: React.FC<Props> = ({ jobsToday, activeBlueprints, completedThisWeek, sitePhotos, completionRate }) => {
  const cards = [
    { label: "Today's Jobs", value: jobsToday, icon: Briefcase, color: 'from-teal-500 to-teal-600', accent: 'text-teal-100' },
    { label: 'Active Blueprints', value: activeBlueprints, icon: Map, color: 'from-blue-500 to-blue-600', accent: 'text-blue-100' },
    { label: 'Site Photos', value: sitePhotos, icon: Camera, color: 'from-indigo-500 to-indigo-600', accent: 'text-indigo-100' },
    { label: 'Completed This Week', value: completedThisWeek, icon: CheckCircle2, color: 'from-emerald-500 to-emerald-600', accent: 'text-emerald-100' },
    { label: 'Completion Rate', value: `${completionRate}%`, icon: TrendingUp, color: 'from-purple-500 to-purple-600', accent: 'text-purple-100' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
      {cards.map((c) => (
        <div key={c.label} className={`bg-gradient-to-br ${c.color} text-white rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow`}>
          <div className="flex items-start justify-between"><c.icon className="w-6 h-6 opacity-90" /></div>
          <div className="mt-4 text-3xl font-bold">{c.value}</div>
          <div className={`text-xs mt-1 ${c.accent}`}>{c.label}</div>
        </div>
      ))}
    </div>
  );
};

export default StatsCards;