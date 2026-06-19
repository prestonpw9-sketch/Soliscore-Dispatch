import { jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
// ── Phase config ───────────────────────────────────────────────────────────
export const PLUMBING_PHASES = [
    'Underground',
    'Rough-In',
    'Top-Out',
    'Trim/Finish',
    'Service Call',
    'T&M',
];
const PHASE_COLORS = {
    'Underground': 'bg-amber-100  text-amber-800  border-amber-200',
    'Rough-In': 'bg-blue-100   text-blue-800   border-blue-200',
    'Top-Out': 'bg-purple-100 text-purple-800 border-purple-200',
    'Trim/Finish': 'bg-green-100  text-green-800  border-green-200',
    'Service Call': 'bg-red-100    text-red-800    border-red-200',
    'T&M': 'bg-slate-100  text-slate-800  border-slate-200',
};
const DEFAULT_COLORS = 'bg-slate-100 text-slate-800 border-slate-200';
export default function PhaseDropdown({ initialPhase = 'Underground', onChange, }) {
    const [phase, setPhase] = useState(initialPhase);
    const handleChange = (e) => {
        const value = e.target.value;
        setPhase(value);
        onChange?.(value);
    };
    return (_jsx("select", { value: phase, onChange: handleChange, className: `font-semibold text-sm rounded-md px-3 py-1 border shadow-sm outline-none cursor-pointer transition-colors ${PHASE_COLORS[phase] ?? DEFAULT_COLORS}`, children: PLUMBING_PHASES.map(p => (_jsx("option", { value: p, className: "bg-white text-gray-900 font-normal", children: p }, p))) }));
}
