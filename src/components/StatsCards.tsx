import React, { useState, useEffect } from 'react';
import {
  Briefcase, Map, Camera, Users, FolderOpen,
} from 'lucide-react';
import type { Job } from '@/lib/data';
import { useAuth } from '@/lib/AuthContext';
import { fetchSubmittalsCount } from '@/lib/submittals';
import { fetchBlueprintsCount, fetchSitePhotosCount } from '@/lib/storageCounts';
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
  submittalsCount: number;
  refreshSubmittals: () => Promise<number | void>;
  refreshBlueprints: () => Promise<number | void>;
  refreshSitePhotos: () => Promise<number | void>;
  reportSubmittalsCount: (count: number) => void;
  reportBlueprintsCount: (count: number) => void;
  reportSitePhotosCount: (count: number) => void;
  onJobsChanged?: () => void | Promise<unknown>;
  onOpenTeam: () => void;
}

const StatsCards: React.FC<Props> = ({
  jobs,
  activeJobCount,
  activeBlueprints,
  sitePhotos,
  activePlumbers,
  submittalsCount,
  refreshSubmittals,
  refreshBlueprints,
  refreshSitePhotos,
  reportSubmittalsCount,
  reportBlueprintsCount,
  reportSitePhotosCount,
  onJobsChanged,
  onOpenTeam,
}) => {
  const { session, loading: authLoading } = useAuth();
  const [jobsModalOpen, setJobsModalOpen]     = useState(false);
  const [blueprintsModalOpen, setBlueprintsModalOpen] = useState(false);
  const [photosModalOpen, setPhotosModalOpen] = useState(false);
  const [submittalsModalOpen, setSubmittalsModalOpen] = useState(false);

  // Belt-and-suspenders: also count directly when the dashboard cards mount.
  useEffect(() => {
    if (authLoading || !session) return;
    let cancelled = false;
    void (async () => {
      const [subs, prints, photos] = await Promise.all([
        fetchSubmittalsCount(),
        fetchBlueprintsCount(),
        fetchSitePhotosCount(),
      ]);
      if (cancelled) return;
      if (subs > 0) reportSubmittalsCount(subs);
      if (prints > 0) reportBlueprintsCount(prints);
      if (photos > 0) reportSitePhotosCount(photos);
    })();
    return () => { cancelled = true; };
  }, [
    authLoading, session,
    reportSubmittalsCount, reportBlueprintsCount, reportSitePhotosCount,
    submittalsModalOpen, blueprintsModalOpen, photosModalOpen,
  ]);

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
              {submittalsCount}
            </h4>
            <p className="text-sm font-bold text-white/90 mt-2">Submittals</p>
          </div>
        </button>
      </div>

      {/* Modals */}
      <ActiveJobsModal
        isOpen={jobsModalOpen}
        onClose={() => setJobsModalOpen(false)}
        onJobsChanged={onJobsChanged}
      />
      <BlueprintsModal
        isOpen={blueprintsModalOpen}
        onClose={() => setBlueprintsModalOpen(false)}
        onCountChange={reportBlueprintsCount}
        onRefresh={refreshBlueprints}
      />
      <SitePhotosModal
        isOpen={photosModalOpen}
        onClose={() => setPhotosModalOpen(false)}
        jobs={jobs}
        onCountChange={reportSitePhotosCount}
        onRefresh={refreshSitePhotos}
      />
      <SubmittalsModal
        isOpen={submittalsModalOpen}
        onClose={() => setSubmittalsModalOpen(false)}
        jobs={jobs}
        onCountChange={reportSubmittalsCount}
        onRefresh={refreshSubmittals}
      />
    </>
  );
};

export default StatsCards;
