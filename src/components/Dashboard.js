import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { ArrowRight, Calculator, CalendarDays } from 'lucide-react';
import StatsCards from './StatsCards';
import JobCard from './JobCard';
import { BlueprintCard } from './BlueprintCard';
import { SitePhotosCard } from './SitePhotosCard';
import TeamModal from './TeamModal';
const Dashboard = ({ jobs, technicians, todayStr, onViewCalendar, onOpenEstimator, onPhaseChange, onHire, onFire, }) => {
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const todayJobs = jobs.filter(j => j.date === todayStr);
    const upcomingJobs = todayJobs.filter(j => j.status !== 'completed').slice(0, 5);
    const activeJobCount = jobs.filter(j => j.status !== 'completed').length;
    const activePlumbers = technicians.filter(t => t.role === 'Plumber').length;
    return (_jsxs("div", { className: "w-full space-y-6", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-black text-slate-900 dark:text-white", children: "Overview" }), _jsx("p", { className: "text-slate-500 dark:text-slate-400 text-sm", children: "Dispatch Control" })] }), _jsxs("button", { type: "button", onClick: onOpenEstimator, className: "flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold shadow-md transition-colors shrink-0", children: [_jsx(Calculator, { className: "w-5 h-5" }), "New Estimate"] })] }), _jsx(StatsCards, { jobs: jobs, activeJobCount: activeJobCount, activeBlueprints: 4, sitePhotos: 12, activePlumbers: activePlumbers, onOpenTeam: () => setIsTeamModalOpen(true) }), _jsxs("div", { className: "grid lg:grid-cols-3 gap-6", children: [_jsxs("div", { className: "lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm", children: [_jsxs("div", { className: "px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("h3", { className: "font-bold text-slate-900 dark:text-white flex items-center gap-2", children: [_jsx(CalendarDays, { className: "w-4 h-4 text-indigo-500", "aria-hidden": "true" }), "Today's Remaining Schedule"] }), _jsx("p", { className: "text-xs text-slate-500 dark:text-slate-400 mt-0.5", children: "Incomplete field deployment routing" })] }), _jsxs("button", { type: "button", onClick: onViewCalendar, className: "text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1", children: ["Open Calendar ", _jsx(ArrowRight, { className: "w-3 h-3", "aria-hidden": "true" })] })] }), _jsx("div", { className: "divide-y divide-slate-100 dark:divide-slate-800", children: upcomingJobs.length === 0 ? (_jsx("div", { className: "p-8 text-center text-sm text-slate-400 font-medium", children: "\uD83C\uDF89 No remaining pending jobs on the schedule for today!" })) : (upcomingJobs.map(job => {
                                    const techName = technicians.find(t => t.id === job.technicianId)?.name ?? 'Unassigned';
                                    return (_jsx("div", { className: "p-4 border-b border-slate-100 dark:border-slate-800/50 last:border-0 flex justify-center hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors", children: _jsx(JobCard, { job: job, technicianName: techName, onPhaseChange: onPhaseChange }) }, job.id));
                                })) })] }), _jsxs("div", { className: "flex flex-col gap-6", children: [_jsx(BlueprintCard, {}), _jsx(SitePhotosCard, {})] })] }), _jsx(TeamModal, { isOpen: isTeamModalOpen, onClose: () => setIsTeamModalOpen(false) })] }));
};
export default Dashboard;
