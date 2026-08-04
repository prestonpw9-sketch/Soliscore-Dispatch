import { useState, useEffect } from 'react';
import {
  PLUMBING_PHASES,
  PHASE_COLORS,
  normalizePhase,
  type PlumbingPhase,
} from '@/lib/phases';

export { PLUMBING_PHASES, type PlumbingPhase } from '@/lib/phases';

const DEFAULT_COLORS = 'bg-slate-100 text-slate-800 border-slate-200';

interface PhaseDropdownProps {
  initialPhase?: PlumbingPhase | string;
  onChange?: (phase: PlumbingPhase) => void;
  disabled?: boolean;
}

export default function PhaseDropdown({
  initialPhase = 'Rough-In',
  onChange,
  disabled,
}: PhaseDropdownProps) {
  const [phase, setPhase] = useState<PlumbingPhase>(() => normalizePhase(initialPhase));

  useEffect(() => {
    setPhase(normalizePhase(initialPhase));
  }, [initialPhase]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = normalizePhase(e.target.value);
    setPhase(value);
    onChange?.(value);
  };

  return (
    <select
      value={phase}
      onChange={handleChange}
      disabled={disabled}
      className={`font-semibold text-sm rounded-md px-3 py-1 border shadow-sm outline-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${PHASE_COLORS[phase] ?? DEFAULT_COLORS}`}
    >
      {PLUMBING_PHASES.map(p => (
        <option key={p} value={p} className="bg-white text-gray-900 font-normal">
          {p}
        </option>
      ))}
    </select>
  );
}
