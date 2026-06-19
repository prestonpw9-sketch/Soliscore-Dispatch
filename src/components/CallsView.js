import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Phone, PhoneCall, PhoneOff, PhoneMissed, Clock, MapPin, AlertCircle, CalendarPlus, CheckCircle2, Search, } from 'lucide-react';
const priorityStyles = {
    emergency: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    normal: 'bg-teal-100 text-teal-700 border-teal-200',
    low: 'bg-slate-100 text-slate-600 border-slate-200',
};
const statusIcon = (s) => {
    switch (s) {
        case 'active': return _jsx(PhoneCall, { className: "w-4 h-4 text-emerald-600 animate-pulse" });
        case 'missed': return _jsx(PhoneMissed, { className: "w-4 h-4 text-red-600" });
        case 'callback': return _jsx(Phone, { className: "w-4 h-4 text-orange-600" });
        case 'completed': return _jsx(PhoneOff, { className: "w-4 h-4 text-slate-400" });
    }
};
const CallsView = ({ calls, onSchedule, onComplete, onCallback, compact, }) => {
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const filtered = calls.filter(c => {
        const matchFilter = filter === 'all' || c.status === filter;
        const matchSearch = !search ||
            c.customerName.toLowerCase().includes(search.toLowerCase()) ||
            c.issue.toLowerCase().includes(search.toLowerCase());
        return matchFilter && matchSearch;
    });
    return (_jsxs("div", { className: "space-y-4 w-full", children: [!compact && (_jsxs("div", { className: "flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between", children: [_jsxs("div", { className: "relative flex-1 max-w-md", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }), _jsx("input", { value: search, onChange: e => setSearch(e.target.value), placeholder: "Search calls by name or issue...", className: "w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none bg-white" })] }), _jsx("div", { className: "flex gap-2 overflow-x-auto", children: ['all', 'active', 'callback', 'missed', 'completed'].map(f => (_jsx("button", { onClick: () => setFilter(f), className: `px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-colors ${filter === f
                                ? 'bg-teal-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`, children: f === 'all' ? 'All Calls' : f }, f))) })] })), _jsxs("div", { className: "grid gap-3", children: [filtered.length === 0 && (_jsx("div", { className: "bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm", children: "No calls match your filters." })), filtered.map(call => (_jsx("div", { className: `bg-white border rounded-xl p-4 shadow-sm ${call.status === 'active'
                            ? 'border-emerald-300 ring-2 ring-emerald-100'
                            : 'border-slate-200'}`, children: _jsxs("div", { className: "flex items-start gap-3 flex-wrap sm:flex-nowrap", children: [_jsx("div", { className: `w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${call.status === 'active'
                                        ? 'bg-emerald-100'
                                        : call.status === 'missed'
                                            ? 'bg-red-50'
                                            : 'bg-slate-100'}`, children: statusIcon(call.status) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("h4", { className: "font-semibold text-slate-900 truncate dark:text-slate-100", children: call.customerName }), _jsxs("span", { className: `text-xs px-2 py-0.5 rounded-full border capitalize ${priorityStyles[call.priority]}`, children: [call.priority === 'emergency' && (_jsx(AlertCircle, { className: "w-3 h-3 inline mr-0.5" })), call.priority] }), _jsxs("span", { className: "text-xs text-slate-500 flex items-center gap-1", children: [_jsx(Clock, { className: "w-3 h-3" }), call.time, call.duration && (_jsxs("span", { className: "ml-1", children: ["\u2022 ", call.duration] }))] })] }), _jsx("p", { className: "text-sm text-slate-600 mt-1 line-clamp-2 dark:text-slate-300", children: call.issue }), _jsxs("div", { className: "flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap", children: [_jsxs("span", { className: "flex items-center gap-1", children: [_jsx(Phone, { className: "w-3 h-3" }), call.phone] }), _jsxs("span", { className: "flex items-center gap-1", children: [_jsx(MapPin, { className: "w-3 h-3" }), call.address] })] })] }), _jsx("div", { className: "flex gap-2 w-full sm:w-auto mt-3 sm:mt-0", children: call.status !== 'completed' ? (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => onSchedule(call), className: "flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition-colors", children: [_jsx(CalendarPlus, { className: "w-4 h-4" }), "Schedule"] }), (call.status === 'missed' || call.status === 'callback') && (_jsxs("button", { onClick: () => onCallback(call), className: "flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors", children: [_jsx(Phone, { className: "w-4 h-4" }), "Call Back"] })), _jsxs("button", { onClick: () => onComplete(call.id), className: "flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700", children: [_jsx(CheckCircle2, { className: "w-4 h-4" }), "Done"] })] })) : (_jsxs("span", { className: "text-xs text-emerald-600 font-medium flex items-center gap-1 mt-2 sm:mt-0", children: [_jsx(CheckCircle2, { className: "w-4 h-4" }), "Resolved"] })) })] }) }, call.id)))] })] }));
};
export default CallsView;
