import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import EstimatorPanel from '../components/EstimatorPanel';
import QuickBidEstimator from '../components/QuickBidEstimator';
// ── Component ──────────────────────────────────────────────────────────────
export default function ProjectView({ projectId }) {
    const [open, setOpen] = useState(false);
    return (_jsxs("div", { className: "flex", children: [_jsx("div", { className: "w-2/3 p-4" }), _jsx("div", { className: "w-1/3 p-4", children: _jsx("button", { type: "button", onClick: () => setOpen(true), "aria-expanded": open, "aria-controls": "project-estimator-panel", className: "bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded transition-colors", children: "Open Quick Bid" }) }), _jsx(EstimatorPanel, { open: open, onClose: () => setOpen(false), children: _jsx(QuickBidEstimator, { mode: "standalone" }) })] }));
}
