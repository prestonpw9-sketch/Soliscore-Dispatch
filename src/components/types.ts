// Re-export phase model from the single source of truth.
export {
  PLUMBING_PHASES,
  PIPELINE_PHASES,
  SIDE_PHASES,
  type PlumbingPhase,
} from '@/lib/phases';

// ── Navigation view keys ───────────────────────────────────────────────────

export type ViewKey =
  | 'dashboard'
  | 'customers'
  | 'estimator'
  | 'takeoff'
  | 'schedule'
  | 'settings';
