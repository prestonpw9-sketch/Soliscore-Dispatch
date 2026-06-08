import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import EstimatorPanel from '../components/EstimatorPanel';
import QuickBidEstimator from '../components/QuickBidEstimator';
export default function ProjectView({ projectId }) {
    const [open, setOpen] = useState(false);
    return (_jsxs("div", { className: "flex", children: [_jsxs("div", { className: "w-2/3 p-4", children: [" ", " "] }), _jsx("div", { className: "w-1/3 p-4", children: _jsx("button", { onClick: () => setOpen(true), className: "bg-blue-600 text-white px-3 py-2 rounded", children: "Open Quick Bid" }) }), _jsx(EstimatorPanel, { open: open, onClose: () => setOpen(false), children: _jsx(QuickBidEstimator, { mode: "project", projectId: projectId }) })] }));
}
