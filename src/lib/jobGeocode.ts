import { supabase } from '@/lib/supabase';
import type { Job } from '@/lib/data';
import { isPlaceholderAddress, parseLatLng } from '../../supabase/functions/_shared/geocode.ts';

export { parseLatLng };

export type GeocodeStatus = 'pending' | 'ok' | 'manual' | 'failed' | 'no_address' | 'stale';

export type PinState = 'pinned' | 'stale' | 'pending' | 'failed' | 'no_address';

export interface GeocodeOutcome {
  jobId: string;
  result: 'pinned' | 'already_pinned' | 'not_found' | 'skipped' | 'failed' | 'no_address' | 'error';
  message?: string;
}

export function normalizeGeocodeStatus(raw: unknown): GeocodeStatus | null {
  return raw === 'pending' || raw === 'ok' || raw === 'manual' || raw === 'failed'
    || raw === 'no_address' || raw === 'stale'
    ? raw
    : null;
}

export function jobPinState(job: Pick<Job, 'latitude' | 'longitude' | 'geocodeStatus' | 'address'>): PinState {
  const pinned = job.latitude != null && job.longitude != null;
  if (pinned) return job.geocodeStatus === 'stale' ? 'stale' : 'pinned';
  if (job.geocodeStatus === 'failed') return 'failed';
  if (job.geocodeStatus === 'no_address' || isPlaceholderAddress(job.address)) return 'no_address';
  return 'pending';
}

/**
 * Ask the geocode-job edge function to pin these jobs. Never throws; a failed
 * call only logs, so creating or saving a job is never blocked by it.
 */
export async function requestJobGeocode(
  jobIds: Array<string | number>,
  options: { replaceStale?: boolean } = {},
): Promise<GeocodeOutcome[] | null> {
  const ids = jobIds.map(String).filter(id => /^\d+$/.test(id)).slice(0, 10);
  if (!ids.length) return null;
  try {
    const { data, error } = await supabase.functions.invoke('geocode-job', {
      body: { jobIds: ids, replaceStale: options.replaceStale === true },
    });
    if (error) {
      console.error('Job geocode request failed:', error.message);
      return null;
    }
    const results = (data as { results?: GeocodeOutcome[] } | null)?.results;
    return Array.isArray(results) ? results : null;
  } catch (err) {
    console.error('Job geocode request failed:', err);
    return null;
  }
}

export function anyPinned(outcomes: GeocodeOutcome[] | null): boolean {
  return Boolean(outcomes?.some(outcome => outcome.result === 'pinned'));
}

/** Pin pasted by hand from the Fix location dialog. */
export async function saveManualJobPin(
  jobId: string,
  latitude: number,
  longitude: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from('jobs').update({
    latitude,
    longitude,
    geocode_status: 'manual',
    geocode_source: 'manual',
    geocoded_address: null,
    geocoded_at: new Date().toISOString(),
  }).eq('id', jobId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * Save a corrected address, then look it up. A pinned job keeps its pin
 * until the lookup succeeds (the address-change trigger marks it stale and
 * replaceStale lets the edge function re-pin it).
 */
export async function saveAddressAndGeocode(
  jobId: string,
  address: string,
): Promise<{ ok: true; outcome: GeocodeOutcome | null } | { ok: false; message: string }> {
  const location = address.replace(/\s+/g, ' ').trim();
  if (!location) return { ok: false, message: 'Enter an address.' };
  const { error } = await supabase.from('jobs').update({ location }).eq('id', jobId);
  if (error) return { ok: false, message: error.message };
  const outcomes = await requestJobGeocode([jobId], { replaceStale: true });
  return { ok: true, outcome: outcomes?.[0] ?? null };
}
