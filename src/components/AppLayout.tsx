import { supabase } from '@/lib/supabase';
import React, { useState, useEffect } from 'react';
import {
  Menu, Plus, Search, Database, RefreshCw,
  Loader2, Calculator, Bell,
} from 'lucide-react';
import Sidebar from './Sidebar';
import type { ViewKey } from './types';
import Dashboard from './Dashboard';
import ScheduleBoard from './ScheduleBoard';
import CustomersView from './CustomersView';
import SettingsView from './SettingsView';
import QuickAddJobModal from './QuickAddJobModal';
import EstimatorPanel from './EstimatorPanel';
import QuickBidEstimator from './QuickBidEstimator';
import BidEstimator from './Bidestimator';
import SlideOutPanel from './SlideOutPanel';
import { weekDates, todayStr } from '@/lib/data';
import type { Job, Customer } from '@/lib/data';
import { useDispatchData } from '@/hooks/useDispatchData';
import { useAuth } from '@/lib/AuthContext';
import { useAIProviderContext } from '@/services/ai/aiProviderFactory';
import DispatchBanner from './DispatchBanner';

// ── Page titles ────────────────────────────────────────────────────────────

const titles: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard:  { title: 'Dashboard',       subtitle: 'Overview of your daily operations' },
  customers:  { title: 'Customers',       subtitle: 'Full customer database and history' },
  estimator:  { title: 'Bid Estimator',   subtitle: 'Quick change orders and fast job bids' },
  takeoff:    { title: 'Full Bid Takeoff', subtitle: 'Full 4-page takeoff for ground-up buildings and houses' },
  schedule:   { title: 'Schedule',        subtitle: 'Plan crews across jobs and track daily progress' },
  settings:   { title: 'System Settings', subtitle: 'Manage profile configuration parameters' },
};

// ── Component ──────────────────────────────────────────────────────────────

const AppLayout: React.FC = () => {
  const { role, canEdit } = useAuth();
  const [view, setView]                     = useState<ViewKey>('dashboard');

  // Which views each role may open (must mirror the Sidebar's NAV_ITEMS).
  const viewAccess: Record<string, string[]> = {
    dashboard: ['owner', 'office', 'crew'],
    schedule:  ['owner', 'office', 'crew'],
    customers: ['owner', 'office'],
    estimator: ['owner', 'crew'],
    takeoff:   ['owner'],
    settings:  ['owner', 'office', 'crew'],
  };
  const canSeeView = (v: string) => !!role && (viewAccess[v]?.includes(role) ?? false);
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [taskDate, setTaskDate]             = useState(todayStr);
  const [modalOpen, setModalOpen]           = useState(false);
  const [modalDefaults, setModalDefaults]   = useState<Partial<Job> | undefined>();
  const [editingJobId, setEditingJobId]     = useState<string | null>(null);
  const [estimatorOpen, setEstimatorOpen]   = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedJob, setSelectedJob]       = useState<Job | null>(null);
  const [toast, setToast]                   = useState<string | null>(null);
  const [toastTone, setToastTone]           = useState<'success' | 'error'>('success');

  const {
    loading,
    error,
    jobs,
    customers,
    technicians,
    refresh,
    createJob,
    updateJob,
    toggleJobStatus,
    rescheduleJob,
    assignTechnician,
    assignTechnicians,
    hireTechnician,
    fireTechnician,
    createCustomer,
    techPriorities,
    techTimeOff,
    announcement,
    submittalsCount,
    blueprintsCount,
    sitePhotosCount,
    refreshSubmittals,
    refreshBlueprints,
    refreshSitePhotos,
    reportSubmittalsCount,
    reportBlueprintsCount,
    reportSitePhotosCount,
    setStopPriority,
    addTimeOff,
    deleteTimeOff,
    updateAnnouncement,
  } = useDispatchData();

  const { updateContext } = useAIProviderContext();

  useEffect(() => {
    const jobActiveOnDay = (job: Job, day: string) => {
      const end = job.endDate ?? job.date;
      return job.date <= day && end >= day;
    };

    const techName = (id: string | null | undefined) =>
      technicians.find(t => t.id === id)?.name;

    const todayOpen = jobs.filter(
      j => jobActiveOnDay(j, todayStr) && j.status !== 'completed',
    );

    const openJobsToday = todayOpen.map(j => ({
      id:           j.id,
      customerName: j.customerName,
      site:         j.address,
      phase:        j.phase,
      status:       j.status,
      serviceType:  j.serviceType,
      tech:         j.technicianIds?.length
        ? j.technicianIds.map(id => techName(id)).filter(Boolean).join(', ')
        : techName(j.technicianId),
      startTime:    j.startTime,
    }));

    const techsOnDuty = technicians
      .filter(t => todayOpen.some(
        j => j.technicianId === t.id || j.technicianIds?.includes(t.id),
      ))
      .map(t => t.name);

    updateContext({
      currentPage:       titles[view].title,
      currentDateTime:   new Date().toLocaleString('en-US', {
        timeZone: 'America/Phoenix',
        weekday:  'long',
        month:    'short',
        day:      'numeric',
        year:     'numeric',
        hour:     'numeric',
        minute:   '2-digit',
        hour12:   true,
      }),
      todayDate:         todayStr,
      activeJobs:        jobs.filter(j => j.status !== 'completed').length,
      // Unassigned scheduled jobs still waiting for a crew.
      pendingDispatches: jobs.filter(j =>
        j.status === 'scheduled'
        && !j.technicianId
        && !(j.technicianIds?.length)
      ).length,
      techsOnDuty,
      openJobsToday,
      totalJobsToday:    todayOpen.length,
      selectedJob: selectedJob
        ? {
            id:           selectedJob.id,
            customerName: selectedJob.customerName,
            address:      selectedJob.address,
            description:  selectedJob.description,
            tech:         techName(selectedJob.technicianId) ?? 'Unassigned',
            phase:        selectedJob.phase,
          }
        : null,
    });
  }, [jobs, technicians, view, selectedJob, updateContext]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const showToast = (msg: string, tone: 'success' | 'error' = 'success') => {
    setToastTone(tone);
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleScheduleFromCustomer = (c: Customer) => {
    setModalDefaults({
      customerName: c.name,
      address: `${c.address}, ${c.city}`,
    });
    setModalOpen(true);
  };

  const handleCustomerCall = (c: Customer) => {
    showToast(`Calling ${c.name}…`);
  };

  const handleCreateCustomer = async (c: Partial<Customer>) => {
    try {
      await createCustomer(c);
      showToast(c.propertyType === 'Commercial' ? 'Builder saved.' : 'Customer saved.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save.';
      showToast(msg);
      throw err;
    }
  };

  const handleSetStopPriority = async (
    technicianId: string,
    workDate: string,
    jobId: string,
    rank: 1 | 2 | null,
  ) => {
    try {
      await setStopPriority(technicianId, workDate, jobId, rank);
      if (rank === 1) showToast('1st stop updated.');
      else if (rank === 2) showToast('2nd stop updated.');
      else showToast('Stop pin cleared.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update stop pin.');
    }
  };

  // FIX: void-wrap all async event handlers
  const handleJobDrop = (jobId: string, newDate: string, newStartHour: number) => {
    void (async () => {
      await rescheduleJob(jobId, newDate, newStartHour);
      showToast('Job successfully rescheduled');
    })();
  };

  const handleToggleTaskStatus = (jobId: string) => {
    void toggleJobStatus(jobId);
  };

  const handleAssignTechnician = (jobId: string, technicianId: string | null) => {
    void (async () => {
      await assignTechnician(jobId, technicianId);
      const tech = technicians.find(t => t.id === technicianId);
      showToast(tech ? `Plumber assigned: ${tech.name}` : 'Plumber unassigned');
    })();
  };

  const handleAssignCrew = (jobId: string, technicianIds: string[]) => {
    void (async () => {
      const result = await assignTechnicians(jobId, technicianIds);
      if (result.ok === false) {
        showToast(result.message, 'error');
        return;
      }
      const n = technicianIds.length;
      showToast(n === 0 ? 'Crew cleared (0 assigned)' : `Crew updated (${n} assigned)`);
    })();
  };

  const handleCreateJob = (job: Omit<Job, 'id'>) => {
    void (async () => {
      const result = editingJobId
        ? await updateJob(editingJobId, job)
        : await createJob(job);
      if (result.ok === false) {
        showToast(result.message, 'error');
        return;
      }
      showToast(editingJobId ? 'Job updated' : 'Job scheduled successfully');
      setEditingJobId(null);
    })();
  };

  // Open the modal pre-filled to EDIT an existing job (e.g. tapping a dashboard card).
  const openJobForEdit = (job: Job) => {
    setEditingJobId(job.id);
    setModalDefaults(job);
    setModalOpen(true);
  };

  const handleRefresh = () => {
    void (async () => {
      await refresh();
      showToast('Data refreshed');
    })();
  };

  const handlePhaseChange = (jobId: string, newPhase: string) => {
    void (async () => {
      const { error: updateError } = await supabase
        .from('jobs')
        .update({ phase: newPhase })
        .eq('id', jobId);

      if (updateError) {
        console.error('Failed to update job phase:', updateError);
        showToast('Error updating phase');
      } else {
        await refresh();
      }
    })();
  };

  const isInitialLoad = (loading || !!error) && customers.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex font-sans w-full">
      <Sidebar
        activeView={view}
        onChange={setView}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
          <div className="flex items-center gap-3 px-4 lg:px-6 py-3">

            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white truncate">
                {titles[view].title}
              </h1>
              <p className="text-xs text-slate-500 truncate hidden sm:block">
                {titles[view].subtitle}
              </p>
            </div>

            {/* DB status badge */}
            <div className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
              error
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              <Database className="w-3.5 h-3.5" />
              {loading ? 'Syncing…' : error ? 'Offline' : 'Live'}
            </div>

            {/* Search */}
            <div className="hidden lg:flex relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="Quick search…"
                aria-label="Quick search"
                className="w-56 pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Refresh data"
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              {loading
                ? <Loader2 className="w-5 h-5 text-slate-600 animate-spin" />
                : <RefreshCw className="w-5 h-5 text-slate-600" />}
            </button>

            {/* FIX: Bell wired to its own handler, not estimator */}
            <button
              type="button"
              onClick={() => setNotificationsOpen(v => !v)}
              aria-label="Notifications"
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              <Bell className="w-5 h-5 text-slate-600" />
            </button>

            {/* Quick Bid */}
            <button
              type="button"
              onClick={() => setEstimatorOpen(true)}
              aria-label="Open Quick Bid panel"
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-3 sm:px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              <Calculator className="w-4 h-4" />
              <span className="hidden sm:inline">Quick Bid</span>
            </button>

            {/* New Job */}
            <button
              type="button"
              onClick={() => {
                setModalDefaults(undefined);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 sm:px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Job</span>
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {/* These views don't depend on dispatch data, so they render immediately
              and are never blocked by the "Loading dispatch data" gate. */}
          {!canSeeView(view) ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-8 max-w-md mx-auto text-center mt-10">
              <p className="font-bold text-amber-800 dark:text-amber-300">Access restricted</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Your account doesn't have permission to view this section. Contact Preston or Greg if you need access.
              </p>
            </div>
          ) : view === 'settings' ? (
            <SettingsView />
          ) : view === 'estimator' ? (
            <QuickBidEstimator mode="standalone" />
          ) : view === 'takeoff' ? (
            <BidEstimator />
          ) : loading && customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-500">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              <p className="mt-3 text-sm">Loading dispatch data…</p>
            </div>
          ) : error && customers.length === 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md mx-auto text-center">
              <p className="font-semibold text-red-700">Could not connect to database</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <>
              {(view === 'dashboard' || view === 'schedule') && (
                <div className="mb-4">
                  <DispatchBanner
                    announcement={announcement}
                    onSave={updateAnnouncement}
                  />
                </div>
              )}

              {view === 'dashboard' && (
                <Dashboard
                  jobs={jobs}
                  technicians={technicians}
                  techPriorities={techPriorities}
                  techTimeOff={techTimeOff}
                  submittalsCount={submittalsCount}
                  blueprintsCount={blueprintsCount}
                  sitePhotosCount={sitePhotosCount}
                  refreshSubmittals={refreshSubmittals}
                  refreshBlueprints={refreshBlueprints}
                  refreshSitePhotos={refreshSitePhotos}
                  reportSubmittalsCount={reportSubmittalsCount}
                  reportBlueprintsCount={reportBlueprintsCount}
                  reportSitePhotosCount={reportSitePhotosCount}
                  onJobsChanged={refresh}
                  todayStr={todayStr}
                  canEdit={canEdit}
                  onViewCalendar={() => setView('schedule')}
                  onOpenEstimator={() => setEstimatorOpen(true)}
                  onPhaseChange={handlePhaseChange}
                  onHire={hireTechnician}
                  onFire={fireTechnician}
                  onJobClick={openJobForEdit}
                  onSetStopPriority={handleSetStopPriority}
                  onAddTimeOff={addTimeOff}
                  onDeleteTimeOff={deleteTimeOff}
                />
              )}

              {view === 'schedule' && (
                <ScheduleBoard
                  jobs={jobs}
                  technicians={technicians}
                  techTimeOff={techTimeOff}
                  onRefresh={refresh}
                />
              )}

              {view === 'customers' && (
                <CustomersView
                  customers={customers}
                  jobs={jobs}
                  onCall={handleCustomerCall}
                  onSchedule={handleScheduleFromCustomer}
                  onCreateCustomer={handleCreateCustomer}
                  onRefresh={refresh}
                />
              )}

            </>
          )}
        </main>
      </div>

      {/* Modals & panels */}
      <QuickAddJobModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalDefaults(undefined);
          setEditingJobId(null);
        }}
        customers={customers}
        technicians={technicians}
        techTimeOff={techTimeOff}
        jobs={jobs}
        weekDates={weekDates}
        defaults={modalDefaults}
        onCreate={handleCreateJob}
      />

      <EstimatorPanel
        open={estimatorOpen}
        onClose={() => setEstimatorOpen(false)}
      >
        <QuickBidEstimator mode="standalone" />
      </EstimatorPanel>

      <SlideOutPanel
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
      />

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 pointer-events-none"
        >
          <span
            className={`w-2 h-2 rounded-full ${toastTone === 'error' ? 'bg-red-400' : 'bg-emerald-400'}`}
            aria-hidden="true"
          />
          {toast}
        </div>
      )}
    </div>
  );
};

export default AppLayout;