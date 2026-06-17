import React from 'react';
import { Briefcase, Map, Camera, Users, HardHat } from 'lucide-react';

interface Props {
  jobsToday: number;
  activeBlueprints: number;
  sitePhotos: number;
  activePlumbers: number;
  activeApprentices: number;
  onOpenTeam: () => void;
}

const StatsCards: React.FC<Props> = ({
  jobsToday,
  activeBlueprints,
  sitePhotos,
  activePlumbers,
  activeApprentices,
  onOpenTeam,
}) => {
  const cards = [
    {
      label: 'Active Jobs',
      value: jobsToday,
      icon: Briefcase,
      colorBg: 'bg-indigo-600 dark:bg-indigo-500',
      trend: 'Live',
      clickable: false,
    },
    {
      label: 'Active Blueprints',
      value: activeBlueprints,
      icon: Map,
      colorBg: 'bg-blue-600 dark:bg-blue-500',
      trend: 'Synced',
      clickable: false,
    },
    {
      label: 'Site Photos',
      value: sitePhotos,
      icon: Camera,
      colorBg: 'bg-emerald-600 dark:bg-emerald-500',
      trend: 'Updating',
      clickable: false,
    },
    {
      label: 'Active Plumbers',
      value: activePlumbers,
      icon: Users,
      colorBg: 'bg-teal-600 dark:bg-teal-500',
      trend: 'Deployed',
      clickable: true,
    },
    {
      label: 'Apprentices',
      value: activeApprentices,
      icon: HardHat,
      colorBg: 'bg-orange-500 dark:bg-orange-600',
      trend: 'In Field',
      clickable: true,
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
      {cards.map(c => (
        <button
          key={c.label}
          type="button"
          onClick={c.clickable ? onOpenTeam : undefined}
          className={`${c.colorBg} rounded-2xl p-5 shadow-md hover:brightness-110 transition-all duration-200 group ${
            c.clickable ? 'cursor-pointer hover:-translate-y-1 active:scale-95' : 'cursor-default'
          } flex flex-col justify-between text-white border border-white/10 text-left`}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
              <c.icon className="w-5 h-5 text-white" />
            </div>
            <span className="flex items-center text-[10px] font-black text-white/70 uppercase tracking-widest">
              {c.trend}
            </span>
          </div>

          <div>
            <h4 className="text-3xl font-black text-white tracking-tight leading-none">
              {c.value}
            </h4>
            <p className="text-sm font-bold text-white/90 mt-2">
              {c.label}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
};

export default StatsCards;