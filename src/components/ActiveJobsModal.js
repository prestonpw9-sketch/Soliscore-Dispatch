import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Briefcase, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
const ActiveJobsModal = ({ isOpen, onClose }) => {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [newCustomer, setNewCustomer] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [newPhase, setNewPhase] = useState('Rough-In');
    const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
    const modalRef = useRef(null);
    const firstFocusRef = useRef(null);
    useEffect(() => {
        if (!isOpen)
            return;
        void fetchJobs();
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
                onClose();
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
    const fetchJobs = async () => {
        setLoading(true);
        setError(null);
        const { data, error: fetchError } = await supabase
            .from('jobs')
            .select('id, customerName, address, status, phase, date, description')
            .neq('status', 'completed')
            .order('date', { ascending: true });
        if (fetchError) {
            setError(fetchError.message);
        }
        else {
            setJobs(data ?? []);
        }
        setLoading(false);
    };
    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newCustomer.trim())
            return;
        setSaving(true);
        setError(null);
        const { data, error: insertError } = await supabase
            .from('jobs')
            .insert({
            customerName: newCustomer.trim(),
            address: newAddress.trim(),
            phase: newPhase,
            date: newDate,
            status: 'scheduled',
        })
            .select()
            .single();
        if (insertError) {
            setError(insertError.message);
        }
        else if (data) {
            setJobs(prev => [...prev, data]);
            setNewCustomer('');
            setNewAddress('');
        }
        setSaving(false);
    };
    const handleDelete = async (id) => {
        setSaving(true);
        setError(null);
        const { error: deleteError } = await supabase.from('jobs').delete().eq('id', id);
        if (deleteError) {
            setError(deleteError.message);
        }
        else {
            setJobs(prev => prev.filter(j => j.id !== id));
            setConfirmDeleteId(null);
        }
        setSaving(false);
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4", onClick: e => { if (e.target === e.currentTarget)
            onClose(); }, children: _jsxs("div", { ref: modalRef, role: "dialog", "aria-modal": "true", "aria-labelledby": "jobs-modal-title", className: "bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh]", children: [_jsxs("div", { className: "flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800 shrink-0", children: [_jsx("h2", { id: "jobs-modal-title", className: "text-xl font-black text-slate-900 dark:text-white", children: "Active Jobs" }), _jsx("button", { type: "button", onClick: onClose, "aria-label": "Close jobs modal", className: "p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500", children: _jsx(X, { className: "w-5 h-5" }) })] }), error && (_jsx("div", { className: "mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium", children: error })), _jsxs("div", { className: "overflow-y-auto p-5 space-y-4 flex-1", children: [loading && (_jsx("div", { className: "flex items-center justify-center py-12", children: _jsx(Loader2, { className: "w-6 h-6 text-indigo-500 animate-spin" }) })), !loading && jobs.length === 0 && (_jsx("p", { className: "text-sm text-slate-500 text-center py-8", children: "No active jobs." })), !loading && jobs.map(job => {
                            const isDeleting = confirmDeleteId === job.id;
                            return (_jsxs("div", { className: "p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col md:flex-row gap-4 justify-between md:items-center", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx(Briefcase, { className: "w-4 h-4 text-indigo-500 shrink-0" }), _jsx("h3", { className: "font-bold text-slate-900 dark:text-white", children: job.customerName || 'Untitled Job' }), _jsx("span", { className: "text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700", children: job.phase }), _jsx("span", { className: `text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${job.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                                                            job.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                                                                'bg-slate-100 text-slate-600'}`, children: job.status })] }), job.address && _jsx("p", { className: "text-sm text-slate-500 mt-1", children: job.address }), _jsx("p", { className: "text-xs text-slate-400 mt-0.5", children: job.date })] }), _jsx("div", { className: "shrink-0 self-start md:self-center", children: isDeleting ? (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xs text-red-600 font-semibold whitespace-nowrap", children: "Remove job?" }), _jsx("button", { type: "button", onClick: () => handleDelete(job.id), disabled: saving, className: "px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors", children: "Yes" }), _jsx("button", { type: "button", onClick: () => setConfirmDeleteId(null), disabled: saving, className: "px-2.5 py-1 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg transition-colors", children: "Cancel" })] })) : (_jsx("button", { type: "button", onClick: () => setConfirmDeleteId(job.id), className: "p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors", children: _jsx(Trash2, { className: "w-5 h-5" }) })) })] }, job.id));
                        })] }), _jsx("div", { className: "p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 shrink-0", children: _jsxs("form", { onSubmit: handleAdd, className: "flex flex-col gap-3", children: [_jsxs("div", { className: "flex gap-3", children: [_jsx("input", { ref: firstFocusRef, type: "text", value: newCustomer, onChange: e => setNewCustomer(e.target.value), placeholder: "Customer name\u2026", "aria-label": "Customer name", className: "flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" }), _jsx("input", { type: "text", value: newAddress, onChange: e => setNewAddress(e.target.value), placeholder: "Address\u2026", "aria-label": "Address", className: "flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" })] }), _jsxs("div", { className: "flex gap-3", children: [_jsxs("select", { value: newPhase, onChange: e => setNewPhase(e.target.value), "aria-label": "Phase", className: "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none", children: [_jsx("option", { children: "Rough-In" }), _jsx("option", { children: "Top-Out" }), _jsx("option", { children: "Trim" }), _jsx("option", { children: "Final" }), _jsx("option", { children: "Service" })] }), _jsx("input", { type: "date", value: newDate, onChange: e => setNewDate(e.target.value), "aria-label": "Job date", className: "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" }), _jsxs("button", { type: "submit", disabled: saving || !newCustomer.trim(), className: "bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors", children: [saving ? _jsx(Loader2, { className: "w-4 h-4 animate-spin" }) : _jsx(Plus, { className: "w-4 h-4" }), " Add"] })] })] }) })] }) }));
};
export default ActiveJobsModal;
