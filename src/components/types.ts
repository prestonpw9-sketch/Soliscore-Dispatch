// ── Plumbing phases ────────────────────────────────────────────────────────

// FIX: `as const` narrows the type to readonly string literals instead of
// a plain mutable `string[]`, which lets you derive PlumbingPhase below
// and catches typos when phase values are compared anywhere in the codebase.
export const PLUMBING_PHASES = [
  'Underground',
  'Rough-In',
  'Top-Out',
  'Trim/Finish',
  'Service Call',
  'T&M',
] as const;

// Derive the union type from the array — single source of truth.
// If you add or rename a phase in the array, this type updates automatically.
export type PlumbingPhase = (typeof PLUMBING_PHASES)[number];
// → 'Underground' | 'Rough-In' | 'Top-Out' | 'Trim/Finish' | 'Service Call' | 'T&M'


// ── Navigation view keys ───────────────────────────────────────────────────

// FIX: 'schedule' and 'settings' are used in AppLayout's titles map and
// Sidebar navigation but were missing from this union, causing a TypeScript
// error on any component that accepts ViewKey and handles those views.
export type ViewKey =
  | 'dashboard'
  | 'calendar'
  | 'tasks'
  | 'customers'
  | 'estimator'
  | 'schedule'
  | 'settings';