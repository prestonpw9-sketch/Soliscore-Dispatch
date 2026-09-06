// ── Plumbing phases ────────────────────────────────────────────────────────

// Phase pipeline + dependency rules live in one place now (@/lib/phases):
// Rough-In → Top-Out → Trim → Final → Punch, plus Service Call & T&M side lanes.
export { PLUMBING_PHASES, type PlumbingPhase } from '@/lib/phases';


// ── Navigation view keys ───────────────────────────────────────────────────

// FIX: 'schedule' and 'settings' are used in AppLayout's titles map and
// Sidebar navigation but were missing from this union, causing a TypeScript
// error on any component that accepts ViewKey and handles those views.
export type ViewKey =
  | 'dashboard'
  | 'customers'
  | 'estimator'
  | 'takeoff'
  | 'truescale'
  | 'schedule'
  | 'settings';