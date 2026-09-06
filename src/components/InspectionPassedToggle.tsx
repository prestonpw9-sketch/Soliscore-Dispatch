import React from 'react';
import { ClipboardCheck } from 'lucide-react';

interface Props {
  checked: boolean;
  disabled?: boolean;
  compact?: boolean;
  onChange: (passed: boolean) => void;
}

/** Marks that rough-in / top-out inspection passed (required before Trim). */
const InspectionPassedToggle: React.FC<Props> = ({
  checked,
  disabled,
  compact,
  onChange,
}) => {
  const label = checked ? 'Inspection passed' : 'Mark inspection passed';
  return (
    <label
      className={
        compact
          ? 'inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none'
          : 'inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none'
      }
      onClick={e => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        onClick={e => e.stopPropagation()}
        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 disabled:opacity-50"
        aria-label="Inspection passed"
      />
      <ClipboardCheck className={compact ? 'w-3 h-3 text-teal-600 shrink-0' : 'w-3.5 h-3.5 text-teal-600 shrink-0'} />
      <span>{label}</span>
    </label>
  );
};

export default InspectionPassedToggle;
