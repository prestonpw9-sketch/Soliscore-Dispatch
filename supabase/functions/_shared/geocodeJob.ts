/**
 * Look up one job's address and store the pin on public.jobs.
 *
 * Existing coordinates are never overwritten: the write is filtered on
 * latitude is null. The one exception is replaceStale, which the Fix
 * location dialog sends after the address was edited on a pinned job (the
 * address-change trigger marks it stale). Even then the write is filtered on
 * geocode_status = 'stale'.
 *
 * The store is injected so scripts/geocode-checks.ts can run this without a
 * database. supabaseJobStore() adapts a supabase-js client.
 */

import { geocodeJobAddress, type GeocodeOptions, type JobGeocodeResult } from './geocode.ts';

export interface JobGeoRow {
  id: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  geocode_status: string | null;
}

export type JobGeoGuard = 'unpinned' | 'stale';

export interface JobGeoPatch {
  latitude?: number;
  longitude?: number;
  geocode_status: 'ok' | 'failed' | 'no_address';
  geocoded_address?: string | null;
  geocode_source?: 'census' | 'nominatim';
  geocoded_at?: string;
}

export interface JobGeocodeStore {
  load(id: string): Promise<JobGeoRow | null>;
  /** Returns how many rows matched the guard. */
  update(id: string, patch: JobGeoPatch, guard: JobGeoGuard): Promise<{ count: number; error?: string }>;
}

export type JobGeocodeOutcome =
  | { jobId: string; result: 'pinned'; latitude: number; longitude: number; matchedAddress: string; source: string }
  | { jobId: string; result: 'already_pinned' | 'not_found' | 'skipped' }
  | { jobId: string; result: 'failed' | 'no_address' | 'error'; message: string };

export interface GeocodeJobOptions {
  replaceStale?: boolean;
  geocode?: (address: string, options?: GeocodeOptions) => Promise<JobGeocodeResult>;
  geocodeOptions?: GeocodeOptions;
  now?: () => Date;
}

function hasPin(row: JobGeoRow): boolean {
  return row.latitude != null && row.longitude != null;
}

export async function geocodeJobById(
  store: JobGeocodeStore,
  jobId: string,
  options: GeocodeJobOptions = {},
): Promise<JobGeocodeOutcome> {
  try {
    const row = await store.load(jobId);
    if (!row) return { jobId, result: 'not_found' };

    let guard: JobGeoGuard = 'unpinned';
    if (hasPin(row)) {
      if (!(options.replaceStale && row.geocode_status === 'stale')) {
        return { jobId, result: 'already_pinned' };
      }
      guard = 'stale';
    }

    const lookup = options.geocode ?? geocodeJobAddress;
    const found = await lookup(row.location ?? '', options.geocodeOptions);
    const at = (options.now?.() ?? new Date()).toISOString();

    if (found.status !== 'ok') {
      // A stale pin keeps its coordinates and its stale flag.
      if (guard === 'stale') return { jobId, result: found.status, message: found.message };
      const saved = await store.update(jobId, { geocode_status: found.status, geocoded_address: null }, guard);
      if (saved.error) return { jobId, result: 'error', message: saved.error };
      return { jobId, result: found.status, message: found.message };
    }

    const saved = await store.update(jobId, {
      latitude: found.latitude,
      longitude: found.longitude,
      geocode_status: 'ok',
      geocoded_address: found.matchedAddress,
      geocode_source: found.source,
      geocoded_at: at,
    }, guard);
    if (saved.error) return { jobId, result: 'error', message: saved.error };
    if (saved.count === 0) return { jobId, result: 'already_pinned' };
    return {
      jobId,
      result: 'pinned',
      latitude: found.latitude,
      longitude: found.longitude,
      matchedAddress: found.matchedAddress,
      source: found.source,
    };
  } catch (err) {
    return { jobId, result: 'error', message: err instanceof Error ? err.message : 'Geocode failed.' };
  }
}

// Minimal structural type so this file does not import supabase-js.
// deno-lint-ignore no-explicit-any
type LooseClient = { from: (table: string) => any };

export function supabaseJobStore(client: LooseClient): JobGeocodeStore {
  return {
    async load(id) {
      const { data, error } = await client
        .from('jobs')
        .select('id, location, latitude, longitude, geocode_status')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: String(data.id),
        location: data.location ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        geocode_status: data.geocode_status ?? null,
      };
    },
    async update(id, patch, guard) {
      let query = client.from('jobs').update(patch).eq('id', id);
      query = guard === 'stale'
        ? query.eq('geocode_status', 'stale')
        : query.is('latitude', null);
      const { data, error } = await query.select('id');
      if (error) return { count: 0, error: error.message };
      return { count: Array.isArray(data) ? data.length : 0 };
    },
  };
}

/** Nominatim asks for about one request per second. */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
