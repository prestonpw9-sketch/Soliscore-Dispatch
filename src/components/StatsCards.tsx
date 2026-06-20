import React, { useState } from 'react';
import {
  Briefcase, Map, Camera, Users, FolderOpen,
} from 'lucide-react';
import type { Job } from '@/lib/data';
import ActiveJobsModal  from './ActiveJobsModal';
import BlueprintsModal  from './BlueprintsModal';
import SitePhotosModal  from './SitePhotosModal';
import SubmittalsModal  from './SubmittalsModal';

interface Props {
  jobs: Job[];
  activeJobCount: number;
  activeBlueprints: number;
  sitePhotos: number;
  activePlumbers: number;
  onOpenTeam: () => void;
}

const StatsCards: React.FC<Props> = ({
  jobs,
  activeJobCount,
  activeBlueprints,
  sitePhotos,
  activePlumbers,
  onOpenTeam,
}) => {
  const [jobsModalOpen, setJobsModalOpen]     = useState(false);
  const [blueprintsModalOpen, setBlueprintsModalOpen] = useState(false);
  const [photosModalOpen, setPhotosModalOpen] = useState(false);
  const [submittalsModalOpen, setSubmittalsModalOpen] = useState(false);

  const submittals = jobs.filter(j => j.status === 'pending');

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">

        {/* Active Jobs */}
        <button
          type="button"
          onClick={() => setJobsModalOpen(true)}
          className="bg-indigo-600 dark:bg-indigo-500 rounded-2xl p-5 shadow-md hover:brightness-110 transition-all duration-200 group cursor-pointer hover:-translate-y-1 active:scale-95 flex flex-col justify-between text-white border border-white/10 text-left"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Live</span>
          </div>
          <div>
            <h4 className="text-3xl font-black text-white tracking-tight leading-none">{activeJobCount}</h4>
            <p className="text-sm font-bold text-white/90 mt-2">Active Jobs</p>
          </div>
        </button>

        {/* Active Blueprints */}
        <button
          type="button"
          onClick={() => setBlueprintsModalOpen(true)}
          className="bg-blue-600 dark:bg-blue-500 rounded-2xl p-5 shadow-md hover:brightness-110 transition-all duration-200 group cursor-pointer hover:-translate-y-1 active:scale-95 flex flex-col justify-between text-white border border-white/10 text-left"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
              <Map className="w-5 h-5 text-white" />
            </div>
            <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Synced</span>
          </div>
          <div>
            <h4 className="text-3xl font-black text-white tracking-tight leading-none">{activeBlueprints}</h4>
            <p className="text-sm font-bold text-white/90 mt-2">Active Blueprints</p>
          </div>
        </button>

        {/* Site Photos */}
        <button
          type="button"
          onClick={() => setPhotosModalOpen(true)}
          className="bg-emerald-600 dark:bg-emerald-500 rounded-2xl p-5 shadow-md hover:brightness-110 transition-all duration-200 group cursor-pointer hover:-translate-y-1 active:scale-95 flex flex-col justify-between text-white border border-white/10 text-left"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Updating</span>
          </div>
          <div>
            <h4 className="text-3xl font-black text-white tracking-tight leading-none">{sitePhotos}</h4>
            <p className="text-sm font-bold text-white/90 mt-2">Site Photos</p>
          </div>
        </button>

        {/* Active Plumbers */}
        <button
          type="button"
          onClick={onOpenTeam}
          className="bg-teal-600 dark:bg-teal-500 rounded-2xl p-5 shadow-md hover:brightness-110 transition-all duration-200 group cursor-pointer hover:-translate-y-1 active:scale-95 flex flex-col justify-between text-white border border-white/10 text-left"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
              <Users className="w-5 h-5 text-white" />
            </div>
            <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Deployed</span>
          </div>
          <div>
            <h4 className="text-3xl font-black text-white tracking-tight leading-none">{activePlumbers}</h4>
            <p className="text-sm font-bold text-white/90 mt-2">Active Plumbers</p>
          </div>
        </button>

        {/* Submittals folder */}
        <button
          type="button"
          onClick={() => setSubmittalsModalOpen(true)}
          className="w-full bg-blue-600 dark:bg-blue-500 rounded-2xl p-5 shadow-md hover:brightness-110 transition-all duration-200 group flex flex-col justify-between text-white border border-white/10 text-left h-full hover:-translate-y-1 active:scale-95"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Open</span>
          </div>
          <div>
            <h4 className="text-3xl font-black text-white tracking-tight leading-none">
              {submittals.length}
            </h4>
            <p className="text-sm font-bold text-white/90 mt-2">Submittals</p>
          </div>
        </button>
      </div>

      {/* Modals */}
      <ActiveJobsModal  isOpen={jobsModalOpen}       onClose={() => setJobsModalOpen(false)} />
      <BlueprintsModal  isOpen={blueprintsModalOpen} onClose={() => setBlueprintsModalOpen(false)} />
      <SitePhotosModal  isOpen={photosModalOpen}     onClose={() => setPhotosModalOpen(false)} />
      <SubmittalsModal  isOpen={submittalsModalOpen} onClose={() => setSubmittalsModalOpen(false)} jobs={jobs} />
    </>
  );
};

export default StatsCards;