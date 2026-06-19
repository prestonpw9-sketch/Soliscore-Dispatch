import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { Search, Phone, Mail, MapPin, Building2, Home, Calendar, Plus, HardHat, FileText, X, } from 'lucide-react';
const EMPTY_FORM = {
    name: '', phone: '', email: '', address: '', city: '',
};
// ── Component ──────────────────────────────────────────────────────────────
const CustomersView = ({ customers, jobs = [], onCall, onSchedule, onCreateCustomer, onAddProject, }) => {
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [selected, setSelected] = useState(null);
    const [showBuilderModal, setShowBuilderModal] = useState(false);
    const [newBuilder, setNewBuilder] = useState(EMPTY_FORM);
    const [saveError, setSaveError] = useState(null);
    const builderProjects = jobs
        .filter(j => j.customerId === selected?.id)
        .map(j => ({
        id: j.id,
        name: j.description,
        activePhases: 1,
        lastUpdate: j.date,
        status: j.status,
    }));
    const modalRef = useRef(null);
    const firstInputRef = useRef(null);
    useEffect(() => {
        if (showBuilderModal) {
            setTimeout(() => firstInputRef.current?.focus(), 0);
        }
    }, [showBuilderModal]);
    useEffect(() => {
        if (!showBuilderModal)
            return;
        const handleKey = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                return;
            }
            if (e.key !== 'Tab')
                return;
            const focusable = modalRef.current?.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
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
    }, [showBuilderModal]);
    function closeModal() {
        setShowBuilderModal(false);
        setNewBuilder(EMPTY_FORM);
        setSaveError(null);
    }
    const filtered = customers.filter(c => {
        const q = search.toLowerCase();
        const matchSearch = !search
            || c.name.toLowerCase().includes(q)
            || c.address.toLowerCase().includes(q)
            || c.phone.includes(search);
        const matchType = typeFilter === 'all' || c.propertyType === typeFilter;
        return matchSearch && matchType;
    });
    const handleSaveBuilder = (e) => {
        e.preventDefault();
        setSaveError(null);
        try {
            onCreateCustomer?.({ ...newBuilder, propertyType: 'Commercial', totalJobs: 0 });
            closeModal();
        }
        catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to save builder.');
        }
    };
    const field = (id) => ({
        id,
        value: newBuilder[id],
        onChange: (e) => setNewBuilder(prev => ({ ...prev, [id]: e.target.value })),
    });
    return (_jsxs("div", { className: "grid lg:grid-cols-3 gap-4 w-full relative", children: [_jsxs("div", { className: "lg:col-span-2 space-y-4", children: [_jsxs("div", { className: "flex flex-col md:flex-row justify-between items-start md:items-center gap-3", children: [_jsxs("div", { className: "relative flex-1 w-full", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }), _jsx("input", { value: search, onChange: e => setSearch(e.target.value), placeholder: "Search customers by name, address, or phone...", "aria-label": "Search customers", className: "w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white" })] }), _jsxs("div", { className: "flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0", children: [['all', 'Residential', 'Commercial'].map(t => (_jsx("button", { type: "button", onClick: () => setTypeFilter(t), className: `px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${typeFilter === t
                                            ? t === 'Commercial' ? 'bg-purple-600 text-white' : 'bg-teal-600 text-white'
                                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`, children: t === 'all' ? 'All' : t === 'Commercial' ? 'Builders / Commercial' : t }, t))), _jsx("div", { className: "h-6 w-px bg-slate-300 dark:bg-slate-700 mx-1", "aria-hidden": "true" }), _jsxs("button", { type: "button", onClick: () => setShowBuilderModal(true), className: "flex items-center gap-1.5 px-3 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap shadow-sm transition-colors", children: [_jsx(Plus, { className: "w-3.5 h-3.5" }), " New Builder"] })] })] }), _jsx("div", { className: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm", children: _jsxs("div", { className: "divide-y divide-slate-100 dark:divide-slate-800", children: [filtered.map(c => (_jsxs("button", { type: "button", onClick: () => setSelected(c), className: `w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-3 ${selected?.id === c.id ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`, children: [_jsx("div", { className: `w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.propertyType === 'Commercial'
                                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                                                : 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300'}`, children: c.propertyType === 'Commercial' ? _jsx(Building2, { className: "w-5 h-5" }) : _jsx(Home, { className: "w-5 h-5" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "font-semibold text-slate-900 dark:text-slate-100 truncate", children: c.name }), _jsxs("div", { className: "text-xs text-slate-500 dark:text-slate-400 truncate", children: [c.address, ", ", c.city] })] }), _jsxs("div", { className: "text-right hidden sm:block", children: [_jsxs("div", { className: "text-xs font-medium text-slate-700 dark:text-slate-300", children: [c.totalJobs, " ", c.propertyType === 'Commercial' ? 'Projects' : 'Jobs'] }), _jsxs("div", { className: "text-xs text-slate-500 dark:text-slate-400", children: ["Last: ", c.lastService] })] })] }, c.id))), filtered.length === 0 && (_jsx("div", { className: "p-8 text-center text-sm text-slate-500", children: "No customers found." }))] }) })] }), _jsx("div", { className: "lg:sticky lg:top-4 h-fit", children: selected ? (_jsxs("div", { className: "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col max-h-[85vh]", children: [_jsx("div", { className: `p-6 text-white shrink-0 ${selected.propertyType === 'Commercial'
                                ? 'bg-gradient-to-br from-purple-700 to-slate-900'
                                : 'bg-gradient-to-br from-teal-600 to-teal-700'}`, children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-12 h-12 rounded-full bg-white/20 flex items-center justify-center", children: selected.propertyType === 'Commercial' ? _jsx(Building2, { className: "w-6 h-6" }) : _jsx(Home, { className: "w-6 h-6" }) }), _jsxs("div", { children: [_jsx("div", { className: "font-bold text-lg", children: selected.name }), _jsx("div", { className: "text-sm text-white/80", children: selected.propertyType === 'Commercial' ? 'General Contractor / Builder' : 'Residential Customer' })] })] }) }), _jsxs("div", { className: "p-5 space-y-4 text-sm overflow-y-auto flex-1", children: [_jsxs("div", { className: "bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-3 border border-slate-100 dark:border-slate-700/50", children: [_jsxs("div", { className: "flex items-start gap-3", children: [_jsx(Phone, { className: "w-4 h-4 text-slate-400 mt-0.5", "aria-hidden": "true" }), _jsx("a", { href: `tel:${selected.phone}`, className: "text-teal-600 dark:text-teal-400 hover:underline font-medium", children: selected.phone })] }), _jsxs("div", { className: "flex items-start gap-3", children: [_jsx(Mail, { className: "w-4 h-4 text-slate-400 mt-0.5", "aria-hidden": "true" }), _jsx("a", { href: `mailto:${selected.email}`, className: "text-teal-600 dark:text-teal-400 hover:underline break-all", children: selected.email })] }), _jsxs("div", { className: "flex items-start gap-3", children: [_jsx(MapPin, { className: "w-4 h-4 text-slate-400 mt-0.5", "aria-hidden": "true" }), _jsxs("span", { className: "text-slate-700 dark:text-slate-300", children: [selected.address, _jsx("br", {}), selected.city] })] })] }), selected.propertyType === 'Commercial' && (_jsxs("div", { className: "pt-2", children: [_jsxs("div", { className: "text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2 mb-3", children: [_jsx(HardHat, { className: "w-4 h-4 text-purple-600", "aria-hidden": "true" }), " Active Projects"] }), _jsxs("div", { className: "space-y-2", children: [builderProjects.length === 0 && (_jsx("p", { className: "text-xs text-slate-400", children: "No active projects for this builder." })), builderProjects.map(proj => (_jsxs("div", { className: "border border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:border-purple-400 dark:hover:border-purple-500 transition-colors bg-white dark:bg-slate-800", children: [_jsxs("div", { className: "flex justify-between items-start mb-1", children: [_jsx("span", { className: "font-semibold text-slate-900 dark:text-slate-100", children: proj.name }), _jsx("span", { className: "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300", children: proj.status })] }), _jsxs("div", { className: "text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2", children: [_jsx(FileText, { className: "w-3 h-3", "aria-hidden": "true" }), proj.activePhases, " Active Phase \u00B7 Updated ", proj.lastUpdate] })] }, proj.id))), _jsxs("button", { type: "button", onClick: () => onAddProject?.(selected.id), className: "w-full py-2.5 mt-2 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 hover:text-purple-600 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-xs font-bold flex items-center justify-center gap-2", children: [_jsx(Plus, { className: "w-4 h-4" }), " Add New Project"] })] })] })), selected.propertyType !== 'Commercial' && (_jsxs("div", { className: "pt-2", children: [_jsx("div", { className: "text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2", children: "Service Notes" }), _jsx("p", { className: "text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50", children: selected.notes || 'No service notes available for this residential property.' })] }))] }), _jsx("div", { className: "p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0", children: _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { type: "button", onClick: () => onCall(selected), className: "flex-1 inline-flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium px-3 py-2 rounded-lg transition-colors", children: [_jsx(Phone, { className: "w-4 h-4" }), " Call"] }), _jsx("button", { type: "button", onClick: () => onSchedule(selected), className: `flex-1 inline-flex items-center justify-center gap-2 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors shadow-sm ${selected.propertyType === 'Commercial' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-teal-600 hover:bg-teal-700'}`, children: selected.propertyType === 'Commercial'
                                            ? _jsxs(_Fragment, { children: [_jsx(HardHat, { className: "w-4 h-4" }), " New Phase"] })
                                            : _jsxs(_Fragment, { children: [_jsx(Calendar, { className: "w-4 h-4" }), " Schedule Job"] }) })] }) })] })) : (_jsxs("div", { className: "bg-transparent border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-12 text-center flex flex-col items-center justify-center", children: [_jsx("div", { className: "w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4", children: _jsx(Building2, { className: "w-8 h-8 text-slate-400" }) }), _jsx("p", { className: "text-slate-500 dark:text-slate-400 font-medium", children: "Select a customer or builder from the list to view their details and active projects." })] })) }), showBuilderModal && (_jsx("div", { className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4", onClick: e => { if (e.target === e.currentTarget)
                    closeModal(); }, children: _jsxs("div", { ref: modalRef, role: "dialog", "aria-modal": "true", "aria-labelledby": "builder-modal-title", className: "bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200", children: [_jsxs("div", { className: "bg-gradient-to-r from-purple-700 to-purple-900 px-6 py-4 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Building2, { className: "w-5 h-5 text-purple-200", "aria-hidden": "true" }), _jsx("h3", { id: "builder-modal-title", className: "text-lg font-bold text-white", children: "Add General Contractor" })] }), _jsx("button", { type: "button", onClick: closeModal, "aria-label": "Close modal", className: "p-1 hover:bg-white/20 rounded-lg text-purple-200 transition-colors", children: _jsx(X, { className: "w-5 h-5" }) })] }), _jsxs("form", { onSubmit: handleSaveBuilder, className: "p-6 space-y-4", children: [_jsxs("div", { children: [_jsx("label", { htmlFor: "builder-name", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "Company / Builder Name *" }), _jsx("input", { ref: firstInputRef, required: true, type: "text", placeholder: "e.g. Summit Construction", className: "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none", ...field('name') })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { htmlFor: "builder-phone", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "Phone Number" }), _jsx("input", { id: "\n                  builder-phone", type: "tel", placeholder: "(555) 123-4567", className: "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "builder-email", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "Email" }), _jsx("input", { type: "email", placeholder: "contact@summit.com", className: "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none", ...field('email') })] })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "builder-address", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "Main Office Address" }), _jsx("input", { type: "text", placeholder: "123 Builder Way", className: "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none", ...field('address') })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "builder-city", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "City" }), _jsx("input", { type: "text", placeholder: "Tucson", className: "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none", ...field('city') })] }), saveError && _jsx("p", { role: "alert", className: "text-xs text-red-600 dark:text-red-400 font-medium", children: saveError }), _jsxs("div", { className: "flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-800", children: [_jsx("button", { type: "button", onClick: closeModal, className: "flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors", children: "Cancel" }), _jsx("button", { type: "submit", className: "flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors", children: "Save Builder" })] })] })] }) }))] }));
};
export default CustomersView;
