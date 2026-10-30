/**
 * Fill latitude / longitude on jobs that have none.
 * Same geocoder as the geocode-job edge function (Census, then Nominatim,
 * Arizona bias). Jobs that already have coordinates are never touched: the
 * write is filtered on latitude is null.
 *
 * Needs the job-geocode migration applied first
 * (supabase/migrations/20261029120000_job_geocode_status.sql).
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node --experimental-strip-types scripts/backfill-job-geocodes.ts --dry-run
 *
 * Flags:
 *   --dry-run      look up and print, write nothing
 *   --limit N      stop after N jobs (default 200)
 *   --include-failed  retry jobs already marked failed / no_address
 *
 * Spaced about 1.1 s per job to respect Nominatim's usage policy.
 */
import { GEOCODE_USER_AGENT } from '../supabase/functions/_shared/geocode.ts';
import {
  geocodeJobById,
  sleep,
  type JobGeoRow,
  type JobGeocodeStore,
} from '../supabase/functions/_shared/geocodeJob.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const includeFailed = args.includes('--include-failed');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? Math.max(1, Number(args[limitIndex + 1]) || 200) : 200;

const baseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!baseUrl || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Add --dry-run to write nothing.');
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function listUnpinned(): Promise<JobGeoRow[]> {
  const url = new URL(`${baseUrl}/rest/v1/jobs`);
  url.searchParams.set('select', 'id,location,latitude,longitude,geocode_status');
  url.searchParams.set('latitude', 'is.null');
  if (!includeFailed) {
    url.searchParams.set('or', '(geocode_status.is.null,geocode_status.eq.pending)');
  }
  url.searchParams.set('order', 'id.asc');
  url.searchParams.set('limit', String(limit));
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`List jobs failed: ${response.status} ${await response.text()}`);
  return await response.json() as JobGeoRow[];
}

const rows = await listUnpinned();
const byId = new Map(rows.map(row => [String(row.id), row]));

const store: JobGeocodeStore = {
  async load(id) {
    return byId.get(id) ?? null;
  },
  async update(id, patch) {
    if (dryRun) return { count: 1 };
    const url = new URL(`${baseUrl}/rest/v1/jobs`);
    url.searchParams.set('id', `eq.${id}`);
    url.searchParams.set('latitude', 'is.null');
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!response.ok) return { count: 0, error: `${response.status} ${await response.text()}` };
    const body = await response.json() as unknown[];
    return { count: Array.isArray(body) ? body.length : 0 };
  },
};

console.log(`${dryRun ? 'DRY RUN — ' : ''}${rows.length} unpinned job(s) to look up.`);
const tally: Record<string, number> = {};
for (const [index, row] of rows.entries()) {
  if (index > 0) await sleep(1_100);
  const outcome = await geocodeJobById(store, String(row.id), {
    geocodeOptions: { userAgent: GEOCODE_USER_AGENT },
  });
  tally[outcome.result] = (tally[outcome.result] ?? 0) + 1;
  const detail = outcome.result === 'pinned'
    ? `${outcome.latitude.toFixed(6)}, ${outcome.longitude.toFixed(6)} via ${outcome.source} (${outcome.matchedAddress})`
    : 'message' in outcome ? outcome.message : '';
  console.log(`#${row.id}  ${JSON.stringify(row.location ?? '')}  → ${outcome.result}${detail ? `  ${detail}` : ''}`);
}

console.log(`${dryRun ? 'DRY RUN — nothing written. ' : ''}Summary: ${JSON.stringify(tally)}`);
