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
];
