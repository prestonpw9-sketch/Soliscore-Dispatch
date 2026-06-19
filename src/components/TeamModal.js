import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Trash2, Briefcase, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
const TeamModal = ({ isOpen, onClose, triggerRef }) => {
    const [technicians, setTechnicians] = useState([]);
    const [todayJobs, setTodayJobs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState('Plumber');
    const [confirmFireId, setConfirmFireId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const modalRef = useRef(null);
    const firstFocusRef = useRef(null);
    const handleClose = () => {
        setConfirmFireId(null);
        setError(null);
        onClose();
        triggerRef?.current?.focus();
    };
    useEffect(() => {
        if (!isOpen)
            return;
        async function fetchData() {
            setLoading(true);
            setError(null);
            const today = new Date().toISOString().split('T')[0];
            const [techRes, jobRes] = await Promise.all([
                supabase.from('technicians').select('id, name, role').order('name'),
                supabase.from('jobs').select('id, title, customerName, phase, technician_id, date').eq('date', today),
            ]);
            if (techRes.error) {
                setError(techRes.error.message);
                setLoading(false);
                return;
            }
            if (jobRes.error) {
                setError(jobRes.error.message);
                setLoading(false);
                return;
            }
            setTechnicians(techRes.data ?? []);
            setTodayJobs(jobRes.data ?? []);
            setLoading(false);
        }
        fetchData();
    }, [isOpen]);
    useEffect(() => {
        if (isOpen)
            setTimeout(() => firstFocusRef.current?.focus(), 0);
    }, [isOpen]);
    useEffect(() => {
        if (!isOpen)
            return;
        const handleKey = (e) => {
            if (e.key === 'Escape') {
                handleClose();
                return;
            }
            if (e.key !== 'Tab')
                return;
            const focusable = modalRef.current?.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])');
            if (!focusable || focusable.length === 0)
                return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen]);
    if (!isOpen)
        return null;
    const handleHire = async (e) => {
        e.preventDefault();
        if (!newName.trim())
            return;
        setSaving(true);
        setError(null);
        const { data, error: insertError } = await supabase
            .from('technicians')
            .insert({ name: newName.trim(), role: newRole })
            .select()
            .single();
        if (insertError) {
            setError(insertError.message);
        }
        else if (data) {
            setTechnicians(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            setNewName('');
        }
        setSaving(false);
    };
    const handleFireConfirmed = async (id) => {
        setSaving(true);
        setError(null);
        const { error: deleteError } = await supabase.from('technicians').delete().eq('id', id);
        if (deleteError) {
            setError(deleteError.message);
        }
        else {
            setTechnicians(prev => prev.filter(t => t.id !== id));
            setConfirmFireId(null);
        }
        setSaving(false);
    };
    return (_jsx("div", { className: "fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4", onClick: e => { if (e.target === e.currentTarget)
            handleClose(); }, children: _jsxs("div", { ref: modalRef, role: "dialog", "aria-modal": "true", "aria-labelledby": "team-modal-title", className: "bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh]", children: [_jsxs("div", { className: "flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800 shrink-0", children: [_jsx("h2", { id: "team-modal-title", className: "text-xl font-black text-slate-900 dark:text-white", children: "Active Roster & Dispatch" }), _jsx("button", { type: "button", onClick: handleClose, "aria-label": "Close roster modal", className: "p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500", children: _jsx(X, { className: "w-5 h-5" }) })] }), error && (_jsx("div", { className: "mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium", children: error })), _jsxs("div", { className: "overflow-y-auto p-5 space-y-4 flex-1", children: [loading && (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsx(Loader2, { className: "w-6 h-6 text-indigo-500 animate-spin" }) })), !loading && technicians.length === 0 && (_jsx("p", { className: "text-sm text-slate-500 text-center py-8", children: "No technicians on the roster yet." })), !loading && technicians.map(tech => {
                            const techJobs = todayJobs.filter(j => j.technician_id === tech.id);
                            const isFiring = confirmFireId === tech.id;
                            return (_jsxs("div", { className: "p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col md:flex-row gap-4 justify-between md:items-center", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("h3", { className: "font-bold text-slate-900 dark:text-white text-lg", children: tech.name }), _jsx("span", { className: `text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${tech.role === 'Plumber' ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'}`, children: tech.role })] }), _jsx("div", { className: "mt-2 space-y-1", children: techJobs.length === 0 ? (_jsxs("p", { className: "text-sm text-slate-500 flex items-center gap-1", children: [_jsx(Briefcase, { className: "w-3 h-3", "aria-hidden": "true" }), " No jobs scheduled today"] })) : (techJobs.map(job => (_jsxs("p", { className: "text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1", children: [_jsx(Briefcase, { className: "w-3 h-3 text-indigo-500", "aria-hidden": "true" }), job.customerName || job.title, " ", job.phase ? `(${job.phase})` : ''] }, job.id)))) })] }), _jsx("div", { className: "shrink-0 self-start md:self-center", children: isFiring ? (_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-xs text-red-600 font-semibold whitespace-nowrap", children: ["Remove ", tech.name, "?"] }), _jsx("button", { type: "button", onClick: () => handleFireConfirmed(tech.id), disabled: saving, "aria-label": `Confirm remove ${tech.name}`, className: "px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors", children: "Yes" }), _jsx("button", { type: "button", onClick: () => setConfirmFireId(null), disabled: saving, "aria-label": `Cancel remove ${tech.name}`, className: "px-2.5 py-1 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg transition-colors", children: "Cancel" })] })) : (_jsx("button", { type: "button", onClick: () => setConfirmFireId(tech.id), "aria-label": `Remove ${tech.name} from roster`, className: "p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors", children: _jsx(Trash2, { className: "w-5 h-5" }) })) })] }, tech.id));
                        })] }), _jsx("div", { className: "p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 shrink-0", children: _jsxs("form", { onSubmit: handleHire, className: "flex gap-3", children: [_jsx("input", { ref: firstFocusRef, type: "text", value: newName, onChange: e => setNewName(e.target.value), placeholder: "New hire name\u2026", "aria-label": "New technician name", className: "flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" }), _jsxs("select", { value: newRole, onChange: e => setNewRole(e.target.value), "aria-label": "New technician role", className: "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none", children: [_jsx("option", { value: "Plumber", children: "Plumber" }), _jsx("option", { value: "Apprentice", children: "Apprentice" })] }), _jsxs("button", { type: "submit", disabled: saving || !newName.trim(), className: "bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors", children: [saving ? _jsx(Loader2, { className: "w-4 h-4 animate-spin" }) : _jsx(UserPlus, { className: "w-4 h-4", "aria-hidden": "true" }), " Add"] })] }) })] }) }));
};
export default TeamModal;
