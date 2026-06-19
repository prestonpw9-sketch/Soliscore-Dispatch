import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { X, Voicemail, FileText, Loader2, Sparkles } from 'lucide-react';
// ── Component ──────────────────────────────────────────────────────────────
const VoicemailImportModal = ({ open, onClose, onCreate, onCreatedToast, }) => {
    const [transcript, setTranscript] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const textareaRef = useRef(null);
    const timerRef = useRef(null);
    // Reset state and focus textarea when modal opens
    useEffect(() => {
        if (open) {
            setTranscript('');
            setIsProcessing(false);
            setTimeout(() => textareaRef.current?.focus(), 0);
        }
    }, [open]);
    // FIX: cancel the timer if the component unmounts mid-processing
    useEffect(() => {
        return () => {
            if (timerRef.current !== null)
                clearTimeout(timerRef.current);
        };
    }, []);
    // Escape to close
    useEffect(() => {
        if (!open)
            return;
        const handler = (e) => { if (e.key === 'Escape')
            onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, onClose]);
    if (!open)
        return null;
    const handleImport = () => {
        if (!transcript.trim() || isProcessing)
            return;
        setIsProcessing(true);
        // Store the timer ref so it can be cancelled on unmount
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            const issue = transcript.length > 60
                ? `${transcript.substring(0, 60)}…`
                : transcript;
            onCreate({
                customerName: 'New Caller (Voicemail)',
                phone: '(555) 019-8273',
                address: 'Pending Address',
                issue,
                status: 'callback',
                priority: 'normal',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                duration: '0:00',
            });
            setIsProcessing(false);
            onCreatedToast('Voicemail imported as pending callback');
            onClose();
        }, 1500);
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4", onClick: onClose, children: _jsxs("div", { role: "dialog", "aria-modal": "true", "aria-labelledby": "voicemail-modal-title", className: "bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "bg-gradient-to-r from-red-500 to-orange-500 px-6 py-4 flex items-center justify-between text-white", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Voicemail, { className: "w-5 h-5", "aria-hidden": "true" }), _jsx("h3", { id: "voicemail-modal-title", className: "text-lg font-bold", children: "Import Google Voicemail" })] }), _jsx("button", { type: "button", onClick: onClose, "aria-label": "Close voicemail import", className: "p-2 hover:bg-white/20 rounded-lg transition-colors", children: _jsx(X, { className: "w-4 h-4" }) })] }), _jsxs("div", { className: "p-6 space-y-4", children: [_jsxs("div", { className: "bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 text-sm p-4 rounded-xl border border-orange-200 dark:border-orange-800/50 flex gap-3", children: [_jsx(Sparkles, { className: "w-5 h-5 shrink-0 mt-0.5", "aria-hidden": "true" }), _jsx("p", { children: "Paste your Google Voice transcript below. The system will automatically extract the customer's issue and queue it as a callback." })] }), _jsxs("div", { children: [_jsxs("label", { htmlFor: "voicemail-transcript", className: "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5", children: [_jsx(FileText, { className: "w-3.5 h-3.5", "aria-hidden": "true" }), "Voicemail Transcript"] }), _jsx("textarea", { ref: textareaRef, id: "voicemail-transcript", value: transcript, onChange: e => setTranscript(e.target.value), placeholder: "Example: Hi this is John from 123 Main St, my water heater is leaking everywhere please call me back\u2026", className: "w-full h-40 p-3 text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-orange-500 outline-none resize-none" })] }), _jsxs("div", { className: "flex gap-3 pt-2", children: [_jsx("button", { type: "button", onClick: onClose, className: "flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors", children: "Cancel" }), _jsx("button", { type: "button", onClick: handleImport, disabled: !transcript.trim() || isProcessing, className: "flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white rounded-xl text-sm font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed", children: isProcessing ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "w-4 h-4 animate-spin", "aria-hidden": "true" }), "Extracting Data\u2026"] })) : ('Parse & Import') })] })] })] }) }));
};
export default VoicemailImportModal;
