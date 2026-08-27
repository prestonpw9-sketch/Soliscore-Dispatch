import React, { useState, useEffect } from 'react';
import {
  Briefcase, Map, Camera, Users, FolderOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

const STAT_CARD_SHELL =
  'relative overflow-hidden rounded-2xl p-5 flex flex-col justify-between text-white text-left ' +
  'border border-white/25 ring-1 ring-inset ring-white/15 ' +
  'backdrop-blur-md shadow-lg shadow-black/20 ' +
  'hover:brightness-110 hover:-translate-y-1 active:scale-95 ' +
  'transition-all duration-200 group cursor-pointer';

interface StatCardProps {
  label: string;
  value: number;
  status: string;
  ledClass: string;
  icon: LucideIcon;
  gradient: string;
  onClick: () => void;
}

const StatCard: React.FC<StatCardProps> = ({
  label, value, status, ledClass, icon: Icon, gradient, onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`${STAT_CARD_SHELL} ${gradient}`}
  >
    <div
      className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent"
      aria-hidden="true"
    />
    <Icon
      className="pointer-events-none absolute -bottom-5 -right-4 w-32 h-32 text-white/[0.14]"
      strokeWidth={1.15}
      aria-hidden="true"
    />
    <div className="relative z-10 flex justify-between items-start mb-4">
      <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-white/85 uppercase tracking-widest">
        <span className={`status-led ${ledClass}`} aria-hidden="true" />
        {status}
      </span>
    </div>
    <div className="relative z-10">
      <h4 className="text-3xl font-black text-white tracking-tight leading-none">{value}</h4>
      <p className="text-sm font-bold text-white/90 mt-2">{label}</p>
    </div>
  </button>
);

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
        <StatCard
          label="Active Jobs"
          value={activeJobCount}
          status="Live"
          ledClass="bg-lime-300 text-lime-300"
          icon={Briefcase}
          gradient="bg-gradient-to-br from-violet-900 via-purple-600 to-fuchsia-500"
          onClick={() => setJobsModalOpen(true)}
        />
        <StatCard
          label="Active Blueprints"
          value={activeBlueprints}
          status="Synced"
          ledClass="bg-cyan-300 text-cyan-300"
          icon={Map}
          gradient="bg-gradient-to-br from-blue-900 via-blue-600 to-sky-400"
          onClick={() => setBlueprintsModalOpen(true)}
        />
        <StatCard
          label="Site Photos"
          value={sitePhotos}
          status="Updating"
          ledClass="bg-amber-300 text-amber-300"
          icon={Camera}
          gradient="bg-gradient-to-br from-emerald-900 via-emerald-600 to-teal-400"
          onClick={() => setPhotosModalOpen(true)}
        />
        <StatCard
          label="Active Plumbers"
          value={activePlumbers}
          status="Deployed"
          ledClass="bg-emerald-300 text-emerald-300"
          icon={Users}
          gradient="bg-gradient-to-br from-teal-900 via-cyan-600 to-cyan-400"
          onClick={onOpenTeam}
        />
        <StatCard
          label="Submittals"
          value={submittalsCount}
          status="Open"
          ledClass="bg-sky-300 text-sky-300"
          icon={FolderOpen}
          gradient="bg-gradient-to-br from-indigo-900 via-indigo-600 to-violet-500"
          onClick={() => setSubmittalsModalOpen(true)}
        />
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
        jobs={jobs}
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
