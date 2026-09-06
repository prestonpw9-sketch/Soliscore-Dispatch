import { useState, useEffect } from 'react';
import { PHASE_COLORS, normalizePhase } from '@/lib/phases';

// Phase list + type now live in one place (@/lib/phases); re-export so existing
// importers of PhaseDropdown keep working.
export { PLUMBING_PHASES, type PlumbingPhase } from '@/lib/phases';
import type { PlumbingPhase } from '@/lib/phases';
import { PLUMBING_PHASES } from '@/lib/phases';

const DEFAULT_COLORS = 'bg-slate-100 text-slate-800 border-slate-200';

// ── Component ──────────────────────────────────────────────────────────────

interface PhaseDropdownProps {
  initialPhase?: string;
  onChange?: (phase: PlumbingPhase) => void;
}

export default function PhaseDropdown({
  initialPhase = 'Rough-In',
  onChange,
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
