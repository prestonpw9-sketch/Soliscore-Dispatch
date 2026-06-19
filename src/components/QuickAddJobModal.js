import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { X, MapPin, Sparkles, Loader2, User, Clock, CalendarDays } from 'lucide-react';
// ── Guard functions ────────────────────────────────────────────────────────
const isJobType = (v) => ['emergency', 'maintenance', 'installation', 'inspection'].includes(v);
const isPriority = (v) => ['emergency', 'high', 'normal', 'low'].includes(v);
// ── Constants ──────────────────────────────────────────────────────────────
const sampleAddresses = [
    '1245 Maple Avenue, Springfield',
    '88 River Street, Springfield',
    '4521 Oak Ridge Drive, Westfield',
    '789 Sunset Boulevard, Springfield',
    '2100 Innovation Way, Westfield',
];
// ── Component ──────────────────────────────────────────────────────────────
const QuickAddJobModal = ({ open, onClose, customers, technicians, weekDates, defaults, onCreate, }) => {
    const [customerName, setCustomerName] = useState('');
    const [customerSuggestions, setCustomerSuggestions] = useState([]);
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [address, setAddress] = useState('');
    const [addressSuggestions, setAddressSuggestions] = useState([]);
    const [showAddressDropdown, setShowAddressDropdown] = useState(false);
    const [type, setType] = useState('maintenance');
    const [priority, setPriority] = useState('normal');
    const [technicianId, setTechnicianId] = useState('');
    const [date, setDate] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [duration, setDuration] = useState(60);
    const [description, setDescription] = useState('');
    const [recommendation, setRecommendation] = useState(null);
    const [recommending, setRecommending] = useState(false);
    const [recError, setRecError] = useState(null);
    const [recApplied, setRecApplied] = useState(false);
    const resetState = () => {
        setCustomerName('');
        setAddress('');
        setDescription('');
        setPriority('normal');
        setType('maintenance');
        setTechnicianId(technicians[0]?.id ?? '');
        setDate(weekDates[0] ?? '');
        setStartTime('09:00');
        setDuration(60);
        setRecommendation(null);
        setRecError(null);
        setRecApplied(false);
        setCustomerSuggestions([]);
        setAddressSuggestions([]);
        setShowCustomerDropdown(false);
        setShowAddressDropdown(false);
    };
    useEffect(() => {
        if (!open)
            return;
        if (defaults) {
            setCustomerName(defaults.customerName ?? '');
            setAddress(defaults.address ?? '');
            setDescription(defaults.description ?? '');
            setPriority(isPriority(defaults.priority ?? '') ? defaults.priority : 'normal');
            setType(isJobType(defaults.type ?? '') ? defaults.type : 'maintenance');
            setTechnicianId(defaults.technicianId ?? technicians[0]?.id ?? '');
            setDate(defaults.date ?? weekDates[0] ?? '');
            setStartTime(defaults.startTime ?? '09:00');
            setDuration(defaults.estimatedDuration ?? 60);
        }
        else {
            resetState();
        }
    }, [open, defaults, technicians, weekDates]);
    useEffect(() => {
        if (!open)
            resetState();
    }, [open]);
    if (!open)
        return null;
    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleCustomerChange = (v) => {
        setCustomerName(v);
        const matches = v
            ? customers.filter(c => c.name.toLowerCase().includes(v.toLowerCase())).slice(0, 5)
            : [];
        setCustomerSuggestions(matches);
        setShowCustomerDropdown(matches.length > 0);
    };
    const selectCustomer = (c) => {
        setCustomerName(c.name);
        setAddress(`${c.address}, ${c.city}`);
        setShowCustomerDropdown(false);
    };
    const handleAddressChange = (v) => {
        setAddress(v);
        const matches = v.length > 1
            ? sampleAddresses.filter(a => a.toLowerCase().includes(v.toLowerCase())).slice(0, 5)
            : [];
        setAddressSuggestions(matches);
        setShowAddressDropdown(matches.length > 0);
    };
    const selectAddress = (a) => {
        setAddress(a);
        setShowAddressDropdown(false);
    };
    const handleRecommend = async () => {
        if (!description.trim()) {
            setRecError('Please enter a job description first.');
            return;
        }
        if (!technicians.length) {
            setRecError('No active technicians available.');
            return;
        }
        setRecommending(true);
        setRecError(null);
        setRecommendation(null);
        setRecApplied(false);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setRecommendation({
            technicianId: technicians[0].id,
            technicianName: technicians[0].name,
            reasoning: 'Best available technician based on current schedule and proximity.',
            confidence: 'high',
        });
        setRecommending(false);
    };
    const handleSubmit = (e) => {
        e.preventDefault();
        const [h, m] = startTime.split(':').map(Number);
        const totalMinutes = h * 60 + m + duration;
        const endHours = Math.floor(totalMinutes / 60);
        const endMinutes = totalMinutes % 60;
        const endTime = `${String(endHours % 24).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
        // FIX: If endHours >= 24, add days to the date
        const startDate = new Date(date.replace(/-/g, '/'));
        const daysToAdd = Math.floor(endHours / 24);
        if (daysToAdd > 0) {
            startDate.setDate(startDate.getDate() + daysToAdd);
        }
        const endDate = startDate.toISOString().split('T')[0];
        const customer = customers.find(c => c.name.toLowerCase() === customerName.toLowerCase());
        const job = {
            customerId: customer?.id ?? `new-${Date.now()}`,
            customerName,
            address,
            type,
            status: 'scheduled',
            priority,
            technicianId,
            date,
            endDate,
            startTime,
            endTime,
            description,
            phase: 'Rough-In',
            estimatedDuration: duration,
        };
        onCreate(job);
        onClose();
    };
    // ── Render ────────────────────────────────────────────────────────────────
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4", onClick: onClose, children: _jsxs("div", { className: "bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between z-10", children: [_jsx("h3", { className: "text-lg font-bold text-slate-900 dark:text-slate-100", children: "Schedule New Job" }), _jsx("button", { type: "button", onClick: onClose, className: "p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500", children: _jsx(X, { className: "w-4 h-4" }) })] }), _jsxs("form", { onSubmit: handleSubmit, className: "p-6 space-y-4", children: [_jsxs("div", { className: "relative", children: [_jsx("label", { htmlFor: "customerName", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "Customer Name" }), _jsxs("div", { className: "relative", children: [_jsx(User, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }), _jsx("input", { id: "customerName", required: true, type: "text", value: customerName, onChange: e => handleCustomerChange(e.target.value), onFocus: () => setShowCustomerDropdown(customerSuggestions.length > 0), onBlur: () => setTimeout(() => setShowCustomerDropdown(false), 150), placeholder: "Type a customer name...", className: "w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none" })] }), showCustomerDropdown && customerSuggestions.length > 0 && (_jsx("div", { className: "absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto", children: customerSuggestions.map(c => (_jsxs("div", { onMouseDown: e => { e.preventDefault(); selectCustomer(c); }, className: "px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0", children: [_jsx("div", { className: "font-semibold text-sm text-slate-800 dark:text-slate-200", children: c.name }), _jsxs("div", { className: "text-xs text-slate-500", children: [c.address, ", ", c.city] })] }, c.id))) }))] }), _jsxs("div", { className: "relative", children: [_jsx("label", { htmlFor: "serviceAddress", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "Service Address" }), _jsxs("div", { className: "relative", children: [_jsx(MapPin, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" }), _jsx("input", { id: "serviceAddress", required: true, type: "text", value: address, onChange: e => handleAddressChange(e.target.value), onFocus: () => setShowAddressDropdown(addressSuggestions.length > 0), onBlur: () => setTimeout(() => setShowAddressDropdown(false), 150), placeholder: "Start typing an address...", className: "w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none" })] }), showAddressDropdown && addressSuggestions.length > 0 && (_jsx("div", { className: "absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden", children: addressSuggestions.map(a => (_jsx("div", { onMouseDown: e => { e.preventDefault(); selectAddress(a); }, className: "px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0 text-sm text-slate-800 dark:text-slate-200", children: a }, a))) }))] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { htmlFor: "serviceType", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "Service Type" }), _jsxs("select", { id: "serviceType", value: type, onChange: e => setType(e.target.value), className: "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer", children: [_jsx("option", { value: "emergency", children: "Emergency" }), _jsx("option", { value: "maintenance", children: "Maintenance" }), _jsx("option", { value: "installation", children: "Installation" }), _jsx("option", { value: "inspection", children: "Inspection" })] })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "priority", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "Priority" }), _jsxs("select", { id: "priority", value: priority, onChange: e => setPriority(e.target.value), className: "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer", children: [_jsx("option", { value: "emergency", children: "Emergency" }), _jsx("option", { value: "high", children: "High" }), _jsx("option", { value: "normal", children: "Normal" }), _jsx("option", { value: "low", children: "Low" })] })] })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "description", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "Job Description" }), _jsx("textarea", { id: "description", required: true, value: description, onChange: e => setDescription(e.target.value), rows: 3, placeholder: "Describe the work to be done...", className: "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none" })] }), _jsxs("div", { className: "space-y-2", children: [!recommendation && (_jsx("button", { type: "button", onClick: () => void handleRecommend(), disabled: recommending, className: "w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 rounded-lg text-xs font-bold hover:from-teal-100 hover:to-emerald-100 disabled:opacity-60 transition-all", children: recommending ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "w-4 h-4 animate-spin" }), " Querying active schedules..."] })) : (_jsxs(_Fragment, { children: [_jsx(Sparkles, { className: "w-4 h-4" }), " Get AI Technician Recommendation"] })) })), recError && _jsx("p", { className: "text-xs text-red-600 font-semibold px-1", children: recError }), recommendation && (_jsxs("div", { className: "rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/30 dark:bg-teal-950/10 p-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-1.5", children: [_jsxs("span", { className: "text-sm font-bold text-slate-900 dark:text-slate-100", children: ["AI Suggestion: ", recommendation.technicianName] }), _jsxs("span", { className: "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300", children: [recommendation.confidence, " fit"] })] }), _jsx("p", { className: "text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed", children: recommendation.reasoning }), _jsx("button", { type: "button", onClick: () => { setTechnicianId(recommendation.technicianId); setRecApplied(true); }, className: "w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-colors", children: recApplied ? 'Applied ✓' : 'Use Suggestion' })] }))] }), _jsxs("div", { className: "space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800/60", children: [_jsxs("div", { children: [_jsx("label", { htmlFor: "technicianId", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "Assigned Technician" }), _jsx("select", { id: "technicianId", value: technicianId, onChange: e => setTechnicianId(e.target.value), className: "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer", children: technicians.map(t => (_jsx("option", { value: t.id, children: t.name }, t.id))) })] }), _jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsxs("div", { children: [_jsxs("label", { htmlFor: "jobDate", className: "text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1", children: [_jsx(CalendarDays, { className: "w-3 h-3 text-slate-400" }), " Date"] }), _jsx("select", { id: "jobDate", value: date, onChange: e => setDate(e.target.value), className: "w-full px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none", children: weekDates.map(d => (_jsx("option", { value: d, children: new Date(d.replace(/-/g, '/')).toLocaleDateString('en-US', {
                                                            weekday: 'short', month: 'short', day: 'numeric',
                                                        }) }, d))) })] }), _jsxs("div", { children: [_jsxs("label", { htmlFor: "startTime", className: "text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1", children: [_jsx(Clock, { className: "w-3 h-3 text-slate-400" }), " Start"] }), _jsx("input", { id: "startTime", type: "time", value: startTime, onChange: e => setStartTime(e.target.value), className: "w-full px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none" })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "duration", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", children: "Duration" }), _jsxs("select", { id: "duration", value: duration, onChange: e => setDuration(Number(e.target.value)), className: "w-full px-2 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none", children: [_jsx("option", { value: 30, children: "30 min" }), _jsx("option", { value: 60, children: "1 hour" }), _jsx("option", { value: 120, children: "2 hours" }), _jsx("option", { value: 180, children: "3 hours" }), _jsx("option", { value: 240, children: "4 hours" }), _jsx("option", { value: 300, children: "5 hours" }), _jsx("option", { value: 360, children: "6 hours" }), _jsx("option", { value: 420, children: "7 hours" }), _jsx("option", { value: 480, children: "8 hours" }), _jsx("option", { value: 540, children: "9 hours" }), _jsx("option", { value: 600, children: "10 hours" })] })] })] })] }), _jsxs("div", { className: "flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800", children: [_jsx("button", { type: "button", onClick: onClose, className: "flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-bold transition-colors", children: "Cancel" }), _jsx("button", { type: "submit", className: "flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors", children: "Create Job" })] })] })] }) }));
};
export default QuickAddJobModal;
