import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { dayNames, hours } from '@/lib/data';
const typeColors = {
    emergency: 'bg-red-500 border-red-600',
    maintenance: 'bg-teal-500 border-teal-600',
    installation: 'bg-emerald-500 border-emerald-600',
    inspection: 'bg-purple-500 border-purple-600',
};
const CalendarView = ({ jobs, technicians, weekDates, onJobClick, onJobDrop, onEmptySlotClick, }) => {
    const [techFilter, setTechFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [draggedJob, setDraggedJob] = useState(null);
    const filteredJobs = jobs.filter(j => {
        if (techFilter !== 'all' && j.technicianId !== techFilter)
            return false;
        if (typeFilter !== 'all' && j.type !== typeFilter)
            return false;
        return true;
    });
    const formatDate = (dateStr) => new Date(dateStr).getDate();
    const isToday = (dateStr) => dateStr === new Date().toISOString().split('T')[0];
    const monthYear = new Date(weekDates[0]).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
    });
    return (_jsxs("div", { className: "space-y-4 w-full", children: [_jsxs("div", { className: "flex flex-col lg:flex-row gap-3 lg:items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { className: "p-2 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800", children: _jsx(ChevronLeft, { className: "w-4 h-4" }) }), _jsx("h2", { className: "text-lg font-semibold text-slate-900 dark:text-slate-100", children: monthYear }), _jsx("button", { className: "p-2 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800", children: _jsx(ChevronRight, { className: "w-4 h-4" }) }), _jsx("button", { className: "px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800", children: "Today" })] }), _jsxs("div", { className: "flex flex-wrap gap-2 items-center", children: [_jsx(Filter, { className: "w-4 h-4 text-slate-500" }), _jsxs("select", { value: techFilter, onChange: e => setTechFilter(e.target.value), className: "text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-teal-500 outline-none", children: [_jsx("option", { value: "all", children: "All Technicians" }), technicians.map(t => (_jsx("option", { value: t.id, children: t.name }, t.id)))] }), _jsxs("select", { value: typeFilter, onChange: e => setTypeFilter(e.target.value), className: "text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-teal-500 outline-none", children: [_jsx("option", { value: "all", children: "All Types" }), _jsx("option", { value: "emergency", children: "Emergency" }), _jsx("option", { value: "maintenance", children: "Maintenance" }), _jsx("option", { value: "installation", children: "Installation" }), _jsx("option", { value: "inspection", children: "Inspection" })] }), _jsx("div", { className: "hidden md:flex items-center gap-3 ml-2 text-xs", children: Object.keys(typeColors).map(t => (_jsxs("span", { className: "flex items-center gap-1 capitalize text-slate-600 dark:text-slate-400", children: [_jsx("span", { className: `w-2.5 h-2.5 rounded-full ${typeColors[t].split(' ')[0]}` }), t] }, t))) })] })] }), _jsx("div", { className: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("div", { className: "min-w-[900px]", children: [_jsxs("div", { className: "grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50", children: [_jsx("div", { className: "p-2 text-xs text-slate-500 font-medium" }), weekDates.map((date, i) => (_jsxs("div", { className: `p-3 text-center border-l border-slate-200 dark:border-slate-800 ${isToday(date) ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`, children: [_jsx("div", { className: "text-xs text-slate-500 font-medium", children: dayNames[i] }), _jsx("div", { className: `text-lg font-bold mt-0.5 ${isToday(date)
                                                    ? 'text-teal-600 dark:text-teal-400'
                                                    : 'text-slate-900 dark:text-slate-100'}`, children: formatDate(date) })] }, date)))] }), hours.map(hour => (_jsxs("div", { className: "grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-100 dark:border-slate-800/50 min-h-[64px]", children: [_jsx("div", { className: "p-2 text-xs text-slate-500 font-medium border-r border-slate-200 dark:border-slate-800", children: hour > 12 ? `${hour - 12}p` : hour === 12 ? '12p' : `${hour}a` }), weekDates.map(date => {
                                        const cellJobs = filteredJobs.filter(j => parseInt(j.startTime.split(':')[0]) === hour && j.date === date);
                                        return (_jsx("div", { onDragOver: e => e.preventDefault(), onDrop: () => {
                                                if (draggedJob) {
                                                    onJobDrop(draggedJob, date, hour);
                                                    setDraggedJob(null);
                                                }
                                            }, onClick: e => {
                                                if (e.target === e.currentTarget && onEmptySlotClick) {
                                                    onEmptySlotClick(date, hour);
                                                }
                                            }, className: `border-l border-slate-200 dark:border-slate-800 p-1 relative cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isToday(date) ? 'bg-teal-50/30 dark:bg-teal-900/10' : ''}`, children: cellJobs.map(job => {
                                                const tech = technicians.find(t => t.id === job.technicianId);
                                                const startH = parseInt(job.startTime.split(':')[0]);
                                                const startM = parseInt(job.startTime.split(':')[1]);
                                                const endH = parseInt(job.endTime.split(':')[0]);
                                                const endM = parseInt(job.endTime.split(':')[1]);
                                                const durationMin = endH * 60 + endM - (startH * 60 + startM);
                                                const heightPx = Math.max(28, (durationMin / 60) * 64 - 4);
                                                const colorClass = typeColors[job.type] ?? 'bg-slate-500 border-slate-600';
                                                return (_jsxs("div", { draggable: true, onDragStart: () => setDraggedJob(job.id), onClick: () => onJobClick(job), className: `${colorClass} text-white text-xs rounded-md p-1.5 mb-1 cursor-pointer hover:opacity-90 border-l-4 shadow-sm`, style: { minHeight: heightPx }, title: `${job.customerName} - ${job.description ?? ''}`, children: [_jsxs("div", { className: "font-semibold truncate", children: [job.startTime, " ", job.customerName] }), _jsx("div", { className: "opacity-90 truncate text-[10px]", children: tech?.name })] }, job.id));
                                            }) }, date + hour));
                                    })] }, hour)))] }) }) })] }));
};
export default CalendarView;
