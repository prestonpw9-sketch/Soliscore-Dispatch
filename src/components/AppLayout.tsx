import { supabase } from '@/lib/supabase';
import React, { useState } from 'react';
import { Menu, Plus, Search, Database, RefreshCw, Loader2, Calculator, Bell } from 'lucide-react';
import Sidebar from './Sidebar';
import { ViewKey } from './types'; 
import Dashboard from './Dashboard';
import CalendarView from './CalendarView';
import TechSchedule from './TechSchedule';
import TasksView from './TasksView';
import CustomersView from './CustomersView';
import SettingsView from './SettingsView';
import QuickAddJobModal from './QuickAddJobModal';
import EstimatorPanel from './EstimatorPanel'; 
import QuickBidEstimator from './QuickBidEstimator';
import SlideOutPanel from './SlideOutPanel';
import { weekDates, todayStr } from '@/lib/data';
import type { Job, Customer } from '@/lib/data';
import { useDispatchData } from '@/hooks/useDispatchData';

const titles: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview of your daily operations' },
  calendar: { title: 'Weekly Calendar', subtitle: 'Drag-and-drop scheduling across technicians' },
  tasks: { title: 'Daily Tasks', subtitle: 'Track jobs per technician' },
  customers: { title: 'Customers', subtitle: 'Full customer database and history' },
  estimator: { title: 'Bid Estimator', subtitle: 'Create, calculate, and save plumbing job bids' }, 
  schedule: { title: 'Crew Schedule', subtitle: 'Manage commercial phases and crew assignments' },
  settings: { title: 'System Settings', subtitle: 'Manage profile configuration parameters' }
};

const AppLayout: React.FC = () => {
  const [view, setView] = useState<ViewKey | 'settings' | any>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [taskDate, setTaskDate] = useState(todayStr);

  // FIX: Completely removed all 'calls' and 'createCall' data destructuring properties
  const {
    loading, error,
    jobs, customers, technicians,
    refresh, createJob, toggleJobStatus, rescheduleJob, updateJobPhase,
    hireTechnician, fireTechnician // <-- Add these two right here!
  } = useDispatchData();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaults, setModalDefaults] = useState<Partial<Job> | undefined>(undefined);
  
  const [estimatorPanelOpen, setEstimatorPanelOpen] = useState(false); 
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleScheduleFromCustomer = (c: Customer) => {
    setModalDefaults({
      customerName: c.name,
      address: `${c.address}, ${c.city}`,
    });
    setModalOpen(true);
  };

  const handleCustomerCall = (c: Customer) => {
    showToast(`Initiating call configuration context to ${c.name}...`);
  };

  const handleJobDrop = async (jobId: string, newDate: string, newStartHour: number) => {
    await rescheduleJob(jobId, newDate, newStartHour);
    showToast('Job successfully rescheduled');
  };

  const handleToggleTaskStatus = async (jobId: string) => {
    await toggleJobStatus(jobId);
  };

  const handleCreateJob = async (job: Omit<Job, 'id'>) => {
    await createJob(job);
    showToast('Job scheduled successfully');
  };
  
  const handleJobClick = (job: Job) => {
    setSelectedJob(job); 
  };

  const handleRefresh = async () => {
    await refresh();
    showToast('Telemetry systems refreshed');
  };
const handlePhaseChange = async (jobId: string, newPhase: string) => {
    // 1. Silently update the database in the background
    const { error } = await supabase
      .from('jobs') // ensure this matches your Supabase table name
      .update({ phase: newPhase })
      .eq('id', jobId);

    if (error) {
      console.error("Failed to update job phase:", error);
      showToast('Error updating phase');
    } else {
      // 2. Quickly refresh the local data so all screens stay in sync
      refresh();
    }
  };
  return (
    <div className="min-h-screen bg-slate-50 flex font-sans w-full">
      <Sidebar activeView={view} onChange={setView} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="flex items-center gap-3 px-4 lg:px-6 py-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-slate-100 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-slate-900 truncate">{titles[view]?.title || 'Dashboard'}</h1>
              <p className="text-xs text-slate-500 truncate hidden sm:block">{titles[view]?.subtitle || ''}</p>
            </div>
            
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 font-medium">
              <Database className="w-3.5 h-3.5" />
              {loading ? 'Syncing…' : error ? 'Offline' : 'Live'}
            </div>
            
            <div className="hidden lg:flex relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                placeholder="Quick system query..."
                className="w-56 pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            
            <button onClick={handleRefresh} className="p-2 hover:bg-slate-100 rounded-lg" title="Refresh">
              {loading ? <Loader2 className="w-5 h-5 text-slate-600 animate-spin" /> : <RefreshCw className="w-5 h-5 text-slate-600" />}
            </button>

            <button
              onClick={() => setEstimatorPanelOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-lg"
              title="Notifications"
            >
              <Bell className="w-5 h-5 text-slate-600" />
            </button>

            <button
              onClick={() => setEstimatorPanelOpen(true)}
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-3 sm:px-4 py-2 rounded-lg shadow-sm transition-colors"
              title="Open Quick Bid Panel"
            >
              <Calculator className="w-4 h-4" />
              <span className="hidden sm:inline">Quick Bid</span>
            </button>

            <button
              onClick={() => { setModalDefaults(undefined); setModalOpen(true); }}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 sm:px-4 py-2 rounded-lg shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Job</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {loading && customers?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-500">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              <p className="mt-3 text-sm">Loading dispatch matrix records...</p>
            </div>
          ) : error && customers?.length === 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md mx-auto text-center">
              <p className="font-semibold text-red-700">Could not connect to database</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
              <button onClick={handleRefresh} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium">
                Retry Connection
              </button>
            </div>
          ) : (
            <>
              {view === 'settings' && <SettingsView />}
              
           {view === 'dashboard' && (
                <Dashboard
                  jobs={jobs}
                  technicians={technicians}
                  todayStr={todayStr}
                  weekDates={weekDates}
                  onViewCalendar={() => setView('calendar')}
                  onViewTasks={() => setView('tasks')}
                  onOpenEstimator={() => setEstimatorPanelOpen(true)}
                  onPhaseChange={handlePhaseChange} 
                  onHire={hireTechnician}
                  onFire={fireTechnician}
                />
              )}
              
              {view === 'calendar' && (
                <CalendarView
                  jobs={jobs}
                  technicians={technicians}
                  weekDates={weekDates}
                  onJobClick={handleJobClick}
                  onJobDrop={handleJobDrop}
                />
              )}

              {view === 'tasks' && (
                <TasksView
                  jobs={jobs}
                  technicians={technicians}
                  onToggleStatus={handleToggleTaskStatus}
                  selectedDate={taskDate}
                  onDateChange={setTaskDate}
                  weekDates={weekDates}
                />
              )}

              {view === 'customers' && (
                <CustomersView
                  customers={customers}
                  onCall={handleCustomerCall}
                  onSchedule={handleScheduleFromCustomer}
                />
              )}

              {view === 'estimator' && (
                <QuickBidEstimator mode="standalone" />
              )}
              
              {view === 'schedule' && (
                <TechSchedule />
              )}
            </>
          )}
        </main>
      </div>

      <QuickAddJobModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setModalDefaults(undefined); }}
        customers={customers}
        technicians={technicians}
        jobs={jobs}
        weekDates={weekDates}
        defaults={modalDefaults}
        onCreate={handleCreateJob}
      />

      <EstimatorPanel 
        open={estimatorPanelOpen} 
        onClose={() => setEstimatorPanelOpen(false)}
      >
        <QuickBidEstimator mode="standalone" />
      </EstimatorPanel>

      <SlideOutPanel 
        job={selectedJob} 
        onClose={() => setSelectedJob(null)} 
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          {toast}
        </div>
      )}

    </div>
  );
};

export default AppLayout;