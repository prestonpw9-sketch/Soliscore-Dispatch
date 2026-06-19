import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { Sparkles, MessageSquare, LayoutDashboard, CalendarDays, ClipboardList, Truck, Users, Calculator, FileSpreadsheet, Settings, X, } from 'lucide-react';
import { AIAssistantPanel } from '@/components/AIAssistant/AIAssistantPanel';
import SMSPanel from '@/components/SMSPanel';
import { useAIProviderContext } from '@/services/ai/aiProviderFactory';
import { useTwilioMessages } from '@/hooks/useTwilioMessages';
import { AI_PROVIDER_CONFIGS } from '@/services/ai/types';
// ── Component ──────────────────────────────────────────────────────────────
export default function Sidebar({ activeView, onChange, open, onClose, }) {
    const [aiOpen, setAiOpen] = useState(false);
    const [smsOpen, setSmsOpen] = useState(false);
    const { activeProvider } = useAIProviderContext();
    const { unreadCount } = useTwilioMessages();
    const config = AI_PROVIDER_CONFIGS[activeProvider];
    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleSmsOpen = () => {
        setSmsOpen(prev => !prev);
        if (aiOpen)
            setAiOpen(false);
    };
    const handleAiOpen = () => {
        setAiOpen(prev => !prev);
        if (smsOpen)
            setSmsOpen(false);
    };
    const handleNavClick = (viewTarget) => {
        onChange(viewTarget);
        onClose();
    };
    // ── Render ────────────────────────────────────────────────────────────────
    return (_jsxs(_Fragment, { children: [open && (_jsx("div", { className: "fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden transition-opacity", onClick: onClose })), _jsxs("div", { className: clsx('bg-slate-900 h-screen w-64 flex flex-col text-slate-300 font-medium border-r border-slate-800', 'transition-transform duration-300 ease-in-out', 'fixed inset-y-0 left-0 z-50 lg:static lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full'), children: [_jsxs("div", { className: "h-16 flex items-center justify-between px-6 border-b border-slate-800 shrink-0", children: [_jsxs("div", { className: "flex items-center", children: [_jsx("div", { className: "w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3 text-white font-black shadow-inner", children: "S" }), _jsx("span", { className: "text-white text-base font-black tracking-wider", children: "SOLISCORE" })] }), _jsx("button", { type: "button", onClick: onClose, className: "lg:hidden p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors", "aria-label": "Close sidebar", children: _jsx(X, { className: "w-5 h-5" }) })] }), _jsxs("nav", { className: "flex-1 px-3 py-4 space-y-1 overflow-y-auto", children: [_jsxs("button", { type: "button", onClick: () => handleNavClick('dashboard'), className: clsx('flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group', activeView === 'dashboard'
                                    ? 'bg-blue-600 text-white'
                                    : 'hover:bg-slate-800/80 hover:text-white text-slate-400'), children: [_jsx(LayoutDashboard, { className: "w-4 h-4 mr-3 shrink-0" }), "Dispatch Board"] }), _jsxs("button", { type: "button", onClick: () => handleNavClick('calendar'), className: clsx('flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group', activeView === 'calendar'
                                    ? 'bg-blue-600 text-white'
                                    : 'hover:bg-slate-800/80 hover:text-white text-slate-400'), children: [_jsx(CalendarDays, { className: "w-4 h-4 mr-3 shrink-0" }), "Weekly Calendar"] }), _jsxs("button", { type: "button", onClick: () => handleNavClick('tasks'), className: clsx('flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group', activeView === 'tasks'
                                    ? 'bg-blue-600 text-white'
                                    : 'hover:bg-slate-800/80 hover:text-white text-slate-400'), children: [_jsx(ClipboardList, { className: "w-4 h-4 mr-3 shrink-0" }), "Daily Tasks"] }), _jsxs("button", { type: "button", onClick: () => handleNavClick('schedule'), className: clsx('flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group', activeView === 'schedule'
                                    ? 'bg-blue-600 text-white'
                                    : 'hover:bg-slate-800/80 hover:text-white text-slate-400'), children: [_jsx(Truck, { className: "w-4 h-4 mr-3 shrink-0" }), "Crew Schedule"] }), _jsxs("button", { type: "button", onClick: () => handleNavClick('customers'), className: clsx('flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group', activeView === 'customers'
                                    ? 'bg-blue-600 text-white'
                                    : 'hover:bg-slate-800/80 hover:text-white text-slate-400'), children: [_jsx(Users, { className: "w-4 h-4 mr-3 shrink-0" }), "Customers Database"] }), _jsxs("button", { type: "button", onClick: () => handleNavClick('estimator'), className: clsx('flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group', activeView === 'estimator'
                                    ? 'bg-blue-600 text-white'
                                    : 'hover:bg-slate-800/80 hover:text-white text-slate-400'), children: [_jsx(Calculator, { className: "w-4 h-4 mr-3 shrink-0" }), "Bid Estimator"] }), _jsxs("button", { type: "button", onClick: () => handleNavClick('takeoff'), className: clsx('flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group', activeView === 'takeoff'
                                    ? 'bg-teal-600 text-white'
                                    : 'hover:bg-slate-800/80 hover:text-white text-slate-400'), children: [_jsx(FileSpreadsheet, { className: "w-4 h-4 mr-3 shrink-0" }), "Full Bid Takeoff"] })] }), _jsxs("div", { className: "p-3 border-t border-slate-800 bg-slate-950/20 space-y-1 shrink-0", children: [_jsxs("button", { type: "button", onClick: () => handleNavClick('settings'), className: clsx('w-full flex items-center px-3 py-2 rounded-xl text-xs transition-colors font-bold', activeView === 'settings'
                                    ? 'bg-blue-600 text-white'
                                    : 'hover:bg-slate-800/80 hover:text-white text-slate-400'), children: [_jsx(Settings, { className: "w-4 h-4 mr-3 shrink-0" }), "System Settings"] }), _jsxs("button", { type: "button", onClick: handleSmsOpen, className: clsx('w-full flex items-center px-3 py-2 rounded-xl text-xs transition-colors font-bold', smsOpen
                                    ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/20'
                                    : 'hover:bg-slate-800/80 hover:text-white text-slate-400'), children: [_jsx(MessageSquare, { className: "w-4 h-4 mr-3 shrink-0" }), _jsx("span", { children: "Messaging Matrix" }), unreadCount > 0 && (_jsx("span", { className: "ml-auto text-[10px] font-black bg-emerald-500 text-white rounded-full min-w-5 h-5 px-1 flex items-center justify-center animate-pulse", children: unreadCount > 9 ? '9+' : unreadCount }))] }), _jsxs("button", { type: "button", onClick: handleAiOpen, className: clsx('w-full flex items-center px-3 py-2 rounded-xl text-xs transition-colors font-bold', aiOpen
                                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                                    : 'hover:bg-slate-800/80 hover:text-white text-slate-400'), children: [_jsx(Sparkles, { className: "w-4 h-4 mr-3 shrink-0" }), _jsx("span", { children: "AI Core Copilot" }), _jsx("span", { className: "ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-500/10 uppercase tracking-wider", children: config?.label || 'Pro' })] })] })] }), aiOpen && (_jsx("div", { className: "fixed inset-y-0 left-64 w-72 z-40 shadow-2xl", children: _jsx(AIAssistantPanel, { onClose: () => setAiOpen(false) }) })), smsOpen && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-6 overflow-y-auto", onClick: e => { if (e.target === e.currentTarget)
                    setSmsOpen(false); }, children: _jsx(SMSPanel, { onClose: () => setSmsOpen(false) }) }))] }));
}
