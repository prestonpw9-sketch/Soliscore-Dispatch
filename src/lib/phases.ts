/**
 * Plumbing phase pipeline + dependency rules.
 * Board order: Rough-In → Top-Out → Trim → Final → Punch, then Service Call & T&M.
 */

export const PIPELINE_PHASES = [
  'Rough-In',
  'Top-Out',
  'Trim',
  'Final',
  'Punch',
] as const;

export const SIDE_PHASES = [
  'Service Call',
  'T&M',
] as const;

/** Master board / dropdown order. */
export const PLUMBING_PHASES = [
  ...PIPELINE_PHASES,
  ...SIDE_PHASES,
] as const;

export type PlumbingPhase = (typeof PLUMBING_PHASES)[number];
export type PipelinePhase = (typeof PIPELINE_PHASES)[number];

/** Map legacy / shorthand labels onto current phases. */
const PHASE_ALIASES: Record<string, PlumbingPhase> = {
  Underground: 'Rough-In',
  Rough: 'Rough-In',
  'Rough In': 'Rough-In',
  'Top Out': 'Top-Out',
  Topout: 'Top-Out',
  'Top-out': 'Top-Out',
  'Trim/Finish': 'Trim',
  'Trim/finish': 'Trim',
  Finish: 'Trim',
};

export function isPlumbingPhase(value: string): value is PlumbingPhase {
  return (PLUMBING_PHASES as readonly string[]).includes(value);
}

export function normalizePhase(raw: string | null | undefined): PlumbingPhase {
  if (!raw) return 'Rough-In';
  if (isPlumbingPhase(raw)) return raw;
  const alias = PHASE_ALIASES[raw];
  if (alias) return alias;
  return 'Rough-In';
}

export function isPipelinePhase(phase: string): phase is PipelinePhase {
  return (PIPELINE_PHASES as readonly string[]).includes(phase);
}

export function isSidePhase(phase: string): boolean {
  return (SIDE_PHASES as readonly string[]).includes(phase);
}

export function pipelineIndex(phase: string): number {
  const n = normalizePhase(phase);
  return PIPELINE_PHASES.indexOf(n as PipelinePhase);
}

export type PhaseGateContext = {
  /** Rough-in / top-out inspection has passed (required before Trim). */
  inspectionPassed: boolean;
};

export type PhaseGateResult =
  | { ok: true; message?: undefined }
  | { ok: false; message: string };

export function phaseBlockedMessage(gate: PhaseGateResult): string | null {
  return gate.ok ? null : gate.message;
}

/**
 * Enforce out-of-order scheduling rules:
 * - Top-Out only after Rough-In (no skipping past Rough-In)
 * - Trim only after Top-Out AND inspection passed
 * - Final only after Trim
 * - Punch only after Final
 * - Service Call / T&M are always allowed (side lanes)
 * - Backward moves within the pipeline are allowed (rework)
 */
export function canChangePhase(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  ctx: PhaseGateContext,
): PhaseGateResult {
  const from = normalizePhase(fromRaw);
  const to = normalizePhase(toRaw);
  if (from === to) return { ok: true };

  // Side lanes are always available.
  if (isSidePhase(to)) return { ok: true };

  // Re-enter the pipeline from a side lane at Rough-In only.
  if (isSidePhase(from)) {
    if (to === 'Rough-In') return { ok: true };
    return {
      ok: false,
      message: 'Move back to Rough-In before advancing through Top-Out → Trim → Final → Punch.',
    };
  }

  const fromIdx = pipelineIndex(from);
  const toIdx = pipelineIndex(to);
  if (fromIdx < 0 || toIdx < 0) return { ok: true };

  // Backward or same rank already handled — allow rework.
  if (toIdx <= fromIdx) return { ok: true };

  // Forward: must be exactly the next pipeline step.
  if (toIdx > fromIdx + 1) {
    return { ok: false, message: skipMessage(to) };
  }

  // Adjacent forward step.
  if (to === 'Top-Out') {
    // Requires Rough-In complete (= currently on Rough-In, advancing).
    if (from !== 'Rough-In') {
      return { ok: false, message: 'Top-out cannot start until rough-in is complete.' };
    }
    return { ok: true };
  }

  if (to === 'Trim') {
    if (from !== 'Top-Out') {
      return { ok: false, message: 'Trim cannot start until top-out is complete and inspection passes.' };
    }
    if (!ctx.inspectionPassed) {
      return { ok: false, message: 'Trim cannot start until inspection passes.' };
    }
    return { ok: true };
  }

  if (to === 'Final') {
    if (from !== 'Trim') {
      return { ok: false, message: 'Final cannot start until trim is complete.' };
    }
    return { ok: true };
  }

  if (to === 'Punch') {
    if (from !== 'Final') {
      return { ok: false, message: 'Punch cannot start until final is complete.' };
    }
    return { ok: true };
  }

  return { ok: true };
}

function skipMessage(target: PlumbingPhase): string {
  switch (target) {
    case 'Top-Out':
      return 'Top-out cannot start until rough-in is complete.';
    case 'Trim':
      return 'Trim cannot start until inspection passes.';
    case 'Final':
      return 'Final cannot start until trim is complete.';
    case 'Punch':
      return 'Punch cannot start until final is complete.';
    default:
      return `Cannot jump ahead to ${target}. Advance one phase at a time.`;
  }
}

/** Next legal pipeline phase, if any (ignores side lanes). */
export function nextPipelinePhase(
  currentRaw: string | null | undefined,
  ctx: PhaseGateContext,
): PlumbingPhase | null {
  const current = normalizePhase(currentRaw);
  if (isSidePhase(current)) return null;
  const idx = pipelineIndex(current);
  if (idx < 0 || idx >= PIPELINE_PHASES.length - 1) return null;
  const next = PIPELINE_PHASES[idx + 1];
  const gate = canChangePhase(current, next, ctx);
  return gate.ok ? next : null;
}

export const PHASE_COLORS: Record<PlumbingPhase, string> = {
  'Rough-In':     'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50',
  'Top-Out':      'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-900/50',
  'Trim':         'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50',
  'Final':        'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-900/50',
  'Punch':        'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/50',
  'Service Call': 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50',
  'T&M':          'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

export const PHASE_HEADER_COLORS: Record<string, string> = {
  'Rough-In': 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  'Top-Out': 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200 border-violet-200 dark:border-violet-800',
  'Trim': 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
  'Final': 'bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-200 border-teal-200 dark:border-teal-800',
  'Punch': 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200 border-orange-200 dark:border-orange-800',
  'Service Call': 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200 border-rose-200 dark:border-rose-800',
  'T&M': 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
  Other: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200 border-orange-200 dark:border-orange-800',
};
