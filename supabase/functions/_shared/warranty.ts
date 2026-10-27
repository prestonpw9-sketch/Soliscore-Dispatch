/**
 * Warranty matching for jobs created by texting (super-processor) and for the
 * dispatch AI context. Pure helpers plus one read-only lookup — nothing here
 * ever completes, restores, or deletes a job.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type CompletedJobRow = {
  id: string | number;
  title?: string | null;
  location?: string | null;
  phase?: string | null;
  status?: string | null;
  completed_at?: string | null;
  warranty_until?: string | null;
};

export type WarrantyMatch = {
  jobId: string;
  title: string;
  location: string;
  phase: string;
  warrantyUntil: string;
};

const SUFFIXES: Record<string, string> = {
  street: 'st', avenue: 'ave', av: 'ave', road: 'rd', drive: 'dr', lane: 'ln',
  court: 'ct', circle: 'cir', boulevard: 'blvd', place: 'pl', parkway: 'pkwy',
  highway: 'hwy', terrace: 'ter', trail: 'trl', way: 'way',
  north: 'n', south: 's', east: 'e', west: 'w',
};

/** Street line only, lowercased, punctuation stripped, suffixes abbreviated. */
export function normalizeAddress(raw: string | null | undefined): string {
  const street = String(raw ?? '').split(',')[0] ?? '';
  return street
    .toLowerCase()
    .replace(/[.#]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => SUFFIXES[word] ?? word)
    .join(' ');
}

function addOneYear(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

/** Stored warranty date, else completed_at (UTC day) + 1 year. */
export function warrantyEnd(row: CompletedJobRow): string | null {
  if (row.warranty_until) return String(row.warranty_until).slice(0, 10);
  if (!row.completed_at) return null;
  const day = String(row.completed_at).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? addOneYear(day) : null;
}

function toMatch(row: CompletedJobRow, until: string): WarrantyMatch {
  return {
    jobId: String(row.id),
    title: String(row.title ?? 'Job'),
    location: String(row.location ?? ''),
    phase: String(row.phase ?? ''),
    warrantyUntil: until,
  };
}

/** Every completed job still under warranty today, soonest expiry first. */
export function activeWarranties(rows: CompletedJobRow[], today: string): WarrantyMatch[] {
  const out: WarrantyMatch[] = [];
  for (const row of rows) {
    if (String(row.status ?? '').toLowerCase() !== 'completed') continue;
    const until = warrantyEnd(row);
    if (until && until >= today) out.push(toMatch(row, until));
  }
  return out.sort((a, b) => a.warrantyUntil.localeCompare(b.warrantyUntil));
}

/**
 * The completed job at the same street address whose warranty runs latest,
 * if it is still covered today. Addresses without a street number never match
 * ("Address pending", lot-only text) so we don't tag unrelated work.
 */
export function findWarrantyMatch(
  address: string,
  rows: CompletedJobRow[],
  today: string,
): WarrantyMatch | null {
  const target = normalizeAddress(address);
  if (!target || !/\d/.test(target)) return null;
  const sameAddress = rows.filter(row => normalizeAddress(row.location) === target);
  // activeWarranties sorts soonest-first, so the last one runs latest.
  return activeWarranties(sameAddress, today).at(-1) ?? null;
}

export function warrantyTitle(title: string): string {
  return /^warranty\b/i.test(title.trim()) ? title : `WARRANTY — ${title}`;
}

export function warrantyNote(match: WarrantyMatch): string {
  const phase = match.phase ? ` ${match.phase}` : '';
  return `Warranty work: matches completed job #${match.jobId} "${match.title}"${phase}, under warranty until ${match.warrantyUntil}.`;
}

/**
 * Read-only lookup. Errors (e.g. the warranty columns not migrated yet) are
 * logged and treated as "no match" so job booking by text never breaks.
 */
export async function lookupWarrantyMatch(
  client: SupabaseClient,
  address: string,
  today: string,
): Promise<WarrantyMatch | null> {
  try {
    const { data, error } = await client
      .from('jobs')
      .select('id, title, location, phase, status, completed_at, warranty_until')
      .eq('status', 'completed');
    if (error) {
      console.error('warranty lookup failed:', error);
      return null;
    }
    return findWarrantyMatch(address, (data ?? []) as CompletedJobRow[], today);
  } catch (err) {
    console.error('warranty lookup crashed:', err);
    return null;
  }
}
