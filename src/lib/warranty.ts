import { arizonaToday } from '@/lib/data';

/** Default warranty length after a job (phase row) is completed. */
export const WARRANTY_YEARS = 1;

/** 'YYYY-MM-DD' + n years. Feb 29 lands on Feb 28 in non-leap years. */
export function addYearsYMD(ymd: string, years: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const year = y + years;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Completion uses the Phoenix calendar day (no 5pm dispatch rollover), matching
// the DB trigger's (completed_at at time zone 'America/Phoenix')::date.
export function defaultWarrantyUntil(completedDay: string = arizonaToday()): string {
  return addYearsYMD(completedDay, WARRANTY_YEARS);
}

/** DB patch for marking a job completed. */
export function completeJobPatch(at: Date = new Date()) {
  return {
    status: 'completed' as const,
    completed_at: at.toISOString(),
    warranty_until: defaultWarrantyUntil(arizonaToday(at)),
  };
}

/** DB patch for putting a completed job back on the board. */
export function restoreJobPatch() {
  return {
    status: 'scheduled' as const,
    completed_at: null,
    warranty_until: null,
  };
}

/** Under warranty through warranty_until (inclusive). No date = not expired. */
export function isWarrantyExpired(warrantyUntil: string | null | undefined, today: string = arizonaToday()): boolean {
  return Boolean(warrantyUntil) && String(warrantyUntil) < today;
}

export function formatWarrantyDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
