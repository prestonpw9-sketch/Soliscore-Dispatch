import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { supabase } from '@/lib/supabase';
import { useState } from 'react';
import { Menu, Plus, Search, Database, RefreshCw, Loader2, Calculator, Bell, } from 'lucide-react';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import CalendarView from './CalendarView';
import TechSchedule from './TechSchedule';
import TasksView from './TasksView';
import CustomersView from './CustomersView';
import SettingsView from './SettingsView';
import QuickAddJobModal from './QuickAddJobModal';
import EstimatorPanel from './EstimatorPanel';
import QuickBidEstimator from './QuickBidEstimator';
import BidEstimator from './Bidestimator';
import SlideOutPanel from './SlideOutPanel';
import { weekDates, todayStr } from '@/lib/data';
import { useDispatchData } from '@/hooks/useDispatchData';
// ── Page titles ────────────────────────────────────────────────────────────
const titles = {
    dashboard: { title: 'Dashboard', subtitle: 'Overview of your daily operations' },
    calendar: { title: 'Weekly Calendar', subtitle: 'Drag-and-drop scheduling across technicians' },
    tasks: { title: 'Daily Tasks', subtitle: 'Track jobs per technician' },
    customers: { title: 'Customers', subtitle: 'Full customer database and history' },
    estimator: { title: 'Bid Estimator', subtitle: 'Quick change orders and fast job bids' },
    takeoff: { title: 'Full Bid Takeoff', subtitle: 'Full 4-page takeoff for ground-up buildings and houses' },
    schedule: { title: 'Crew Schedule', subtitle: 'Manage commercial phases and crew assignments' },
    settings: { title: 'System Settings', subtitle: 'Manage profile configuration parameters' },
};
// ── Component ──────────────────────────────────────────────────────────────
const AppLayout = () => {
    const [view, setView] = useState('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [taskDate, setTaskDate] = useState(todayStr);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalDefaults, setModalDefaults] = useState();
    const [estimatorOpen, setEstimatorOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);
    const [toast, setToast] = useState(null);
    const { loading, error, jobs, customers, technicians, refresh, createJob, toggleJobStatus, rescheduleJob, hireTechnician, fireTechnician, } = useDispatchData();
    // ── Helpers ──────────────────────────────────────────────────────────────
    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    };
    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleScheduleFromCustomer = (c) => {
        setModalDefaults({
            customerName: c.name,
            address: `${c.address}, ${c.city}`,
        });
        setModalOpen(true);
    };
    const handleCustomerCall = (c) => {
        showToast(`Calling ${c.name}…`);
    };
    // FIX: void-wrap all async event handlers
    const handleJobDrop = (jobId, newDate, newStartHour) => {
        void (async () => {
            await rescheduleJob(jobId, newDate, newStartHour);
            showToast('Job successfully rescheduled');
        })();
    };
    const handleToggleTaskStatus = (jobId) => {
        void toggleJobStatus(jobId);
    };
    const handleCreateJob = (job) => {
        void (async () => {
            await createJob(job);
            showToast('Job scheduled successfully');
        })();
    };
    const handleRefresh = () => {
        void (async () => {
            await refresh();
            showToast('Data refreshed');
        })();
    };
    const handlePhaseChange = (jobId, newPhase) => {
        void (async () => {
            const { error: updateError } = await supabase
                .from('jobs')
                .update({ phase: newPhase })
                .eq('id', jobId);
            if (updateError) {
                console.error('Failed to update job phase:', updateError);
                showToast('Error updating phase');
            }
            else {
                await refresh();
            }
        })();
    };
    const isInitialLoad = (loading || !!error) && customers.length === 0;
    return (_jsxs("div", { className: "min-h-screen bg-slate-50 dark:bg-slate-950 flex font-sans w-full", children: [_jsx(Sidebar, { activeView: view, onChange: setView, open: sidebarOpen, onClose: () => setSidebarOpen(false) }), _jsxs("div", { className: "flex-1 flex flex-col min-w-0", children: [_jsx("header", { className: "bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20", children: _jsxs("div", { className: "flex items-center gap-3 px-4 lg:px-6 py-3", children: [_jsx("button", { type: "button", onClick: () => setSidebarOpen(true), "aria-label": "Open sidebar", className: "lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg", children: _jsx(Menu, { className: "w-5 h-5" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("h1", { className: "text-lg md:text-xl font-bold text-slate-900 dark:text-white truncate", children: titles[view].title }), _jsx("p", { className: "text-xs text-slate-500 truncate hidden sm:block", children: titles[view].subtitle })] }), _jsxs("div", { className: `hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${error
                                        ? 'bg-red-50 border-red-200 text-red-700'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`, children: [_jsx(Database, { className: "w-3.5 h-3.5" }), loading ? 'Syncing…' : error ? 'Offline' : 'Live'] }), _jsxs("div", { className: "hidden lg:flex relative", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400", "aria-hidden": "true" }), _jsx("input", { type: "search", placeholder: "Quick search\u2026", "aria-label": "Quick search", className: "w-56 pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-blue-500 outline-none" })] }), _jsx("button", { type: "button", onClick: handleRefresh, "aria-label": "Refresh data", className: "p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg", children: loading
                                        ? _jsx(Loader2, { className: "w-5 h-5 text-slate-600 animate-spin" })
                                        : _jsx(RefreshCw, { className: "w-5 h-5 text-slate-600" }) }), _jsx("button", { type: "button", onClick: () => setNotificationsOpen(v => !v), "aria-label": "Notifications", className: "p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg", children: _jsx(Bell, { className: "w-5 h-5 text-slate-600" }) }), _jsxs("button", { type: "button", onClick: () => setEstimatorOpen(true), "aria-label": "Open Quick Bid panel", className: "inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-3 sm:px-4 py-2 rounded-lg shadow-sm transition-colors", children: [_jsx(Calculator, { className: "w-4 h-4" }), _jsx("span", { className: "hidden sm:inline", children: "Quick Bid" })] }), _jsxs("button", { type: "button", onClick: () => {
                                        setModalDefaults(undefined);
                                        setModalOpen(true);
                                    }, className: "inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 sm:px-4 py-2 rounded-lg shadow-sm transition-colors", children: [_jsx(Plus, { className: "w-4 h-4" }), _jsx("span", { className: "hidden sm:inline", children: "New Job" })] })] }) }), _jsx("main", { className: "flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto", children: loading && customers.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-24 text-slate-500", children: [_jsx(Loader2, { className: "w-10 h-10 animate-spin text-blue-600" }), _jsx("p", { className: "mt-3 text-sm", children: "Loading dispatch data\u2026" })] })) : error && customers.length === 0 ? (_jsxs("div", { className: "bg-red-50 border border-red-200 rounded-xl p-6 max-w-md mx-auto text-center", children: [_jsx("p", { className: "font-semibold text-red-700", children: "Could not connect to database" }), _jsx("p", { className: "text-sm text-red-600 mt-1", children: error }), _jsx("button", { type: "button", onClick: handleRefresh, className: "mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors", children: "Retry Connection" })] })) : (_jsxs(_Fragment, { children: [view === 'settings' && _jsx(SettingsView, {}), view === 'dashboard' && (_jsx(Dashboard, { jobs: jobs, technicians: technicians, todayStr: todayStr, 
                                    // FIX: weekDates and onViewTasks removed — Dashboard no longer accepts these props
                                    onViewCalendar: () => setView('calendar'), onOpenEstimator: () => setEstimatorOpen(true), onPhaseChange: handlePhaseChange, onHire: hireTechnician, onFire: fireTechnician })), view === 'calendar' && (_jsx(CalendarView, { jobs: jobs, technicians: technicians, weekDates: weekDates, onJobClick: setSelectedJob, onJobDrop: handleJobDrop })), view === 'tasks' && (_jsx(TasksView, { jobs: jobs, technicians: technicians, onToggleStatus: handleToggleTaskStatus, selectedDate: taskDate, onDateChange: setTaskDate, weekDates: weekDates })), view === 'customers' && (_jsx(CustomersView, { customers: customers, onCall: handleCustomerCall, onSchedule: handleScheduleFromCustomer })), view === 'estimator' && _jsx(QuickBidEstimator, { mode: "standalone" }), view === 'takeoff' && _jsx(BidEstimator, {}), view === 'schedule' && _jsx(TechSchedule, {})] })) })] }), _jsx(QuickAddJobModal, { open: modalOpen, onClose: () => {
                    setModalOpen(false);
                    setModalDefaults(undefined);
                }, customers: customers, technicians: technicians, jobs: jobs, weekDates: weekDates, defaults: modalDefaults, onCreate: handleCreateJob }), _jsx(EstimatorPanel, { open: estimatorOpen, onClose: () => setEstimatorOpen(false), children: _jsx(QuickBidEstimator, { mode: "standalone" }) }), _jsx(SlideOutPanel, { job: selectedJob, onClose: () => setSelectedJob(null) }), toast && (_jsxs("div", { role: "status", "aria-live": "polite", className: "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 pointer-events-none", children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-emerald-400", "aria-hidden": "true" }), toast] }))] }));
};
export default AppLayout;
