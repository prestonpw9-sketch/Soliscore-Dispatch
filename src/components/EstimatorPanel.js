import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { X } from 'lucide-react';
import ExcelImporter from '../components/ExcelImporter';
export default function EstimatorPanel({ open, onClose, children }) {
    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : 'unset';
        return () => { document.body.style.overflow = 'unset'; };
    }, [open]);
    if (!open)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-[60] flex justify-end bg-slate-900/40 backdrop-blur-sm", children: _jsxs("div", { className: "w-full max-w-5xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300", children: [_jsxs("div", { className: "flex items-center justify-between p-4 border-b bg-slate-50 shrink-0", children: [_jsx("h2", { className: "text-xl font-bold text-slate-800", children: "Quick Bid Estimator" }), _jsx("button", { type: "button", onClick: onClose, "aria-label": "Close estimator panel", className: "p-2 hover:bg-slate-200 rounded-full transition-colors", children: _jsx(X, { className: "w-6 h-6 text-slate-500" }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 flex flex-col gap-4", children: [_jsxs("section", { className: "p-4 border border-slate-200 rounded-xl bg-slate-50 shrink-0", children: [_jsx("h3", { className: "text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider", children: "Import Bid Sheets" }), _jsx(ExcelImporter, { onImportComplete: summary => {
                                        console.log('Import finished', summary);
                                    } })] }), _jsx("div", { className: "flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm", children: children })] })] }) }));
}
