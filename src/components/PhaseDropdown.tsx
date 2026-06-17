import { useState } from 'react';

// ── Phase config ───────────────────────────────────────────────────────────

export const PLUMBING_PHASES = [
  'Underground',
  'Rough-In',
  'Top-Out',
  'Trim/Finish',
  'Service Call',
  'T&M',
] as const;

export type PlumbingPhase = typeof PLUMBING_PHASES[number];

const PHASE_COLORS: Record<PlumbingPhase, string> = {
  'Underground':  'bg-amber-100  text-amber-800  border-amber-200',
  'Rough-In':     'bg-blue-100   text-blue-800   border-blue-200',
  'Top-Out':      'bg-purple-100 text-purple-800 border-purple-200',
  'Trim/Finish':  'bg-green-100  text-green-800  border-green-200',
  'Service Call': 'bg-red-100    text-red-800    border-red-200',
  'T&M':          'bg-slate-100  text-slate-800  border-slate-200',
};

const DEFAULT_COLORS = 'bg-slate-100 text-slate-800 border-slate-200';

// ── Component ──────────────────────────────────────────────────────────────

interface PhaseDropdownProps {
  initialPhase?: PlumbingPhase;
  onChange?: (phase: PlumbingPhase) => void;
}

export default function PhaseDropdown({
  initialPhase = 'Underground',
  onChange,
}: PhaseDropdownProps) {
  const [phase, setPhase] = useState<PlumbingPhase>(initialPhase);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as PlumbingPhase;
    setPhase(value);
    onChange?.(value);
  };

  return (
    <select
      value={phase}
      onChange={handleChange}
      className={`font-semibold text-sm rounded-md px-3 py-1 border shadow-sm outline-none cursor-pointer transition-colors ${PHASE_COLORS[phase] ?? DEFAULT_COLORS}`}
    >
      {PLUMBING_PHASES.map(p => (
        <option key={p} value={p} className="bg-white text-gray-900 font-normal">
          {p}
        </option>
      ))}
    </select>
  );
}