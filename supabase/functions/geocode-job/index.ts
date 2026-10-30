/**
 * Geocode job addresses server-side and fill jobs.latitude / longitude.
 *
 * Called by the app after a job is created or its address changes, and by the
 * Fix location dialog. Owner and crew only (office is view-only).
 *
 *   POST { jobId: 123 }                     one job
 *   POST { jobIds: [123, 124] }             up to 10 jobs, spaced for Nominatim
 *   POST { jobId: 123, replaceStale: true } re-pin after the address was edited
 *
 * Existing coordinates are never overwritten (see _shared/geocodeJob.ts).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireDispatchUser } from '../_shared/callerAuthLive.ts';
import { GEOCODE_USER_AGENT } from '../_shared/geocode.ts';
import { geocodeJobById, sleep, supabaseJobStore, type JobGeocodeOutcome } from '../_shared/geocodeJob.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const;

const MAX_JOBS = 10;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function jobIdsFrom(body: Record<string, unknown>): string[] {
  const raw = Array.isArray(body.jobIds) ? body.jobIds : [body.jobId];
  const ids = raw
    .map(value => String(value ?? '').trim())
    .filter(value => /^\d+$/.test(value));
  return Array.from(new Set(ids)).slice(0, MAX_JOBS);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const caller = await requireDispatchUser(req, {
    requireWriter: true,
    writerError: 'Read-only role cannot change job locations.',
  });
  if (!caller.ok) return json({ error: caller.error }, caller.status);

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const ids = jobIdsFrom(body);
  if (!ids.length) return json({ error: 'Send jobId or jobIds.' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is missing Supabase credentials.' }, 500);
  const store = supabaseJobStore(createClient(supabaseUrl, serviceKey));

  const results: JobGeocodeOutcome[] = [];
  for (const [index, id] of ids.entries()) {
    if (index > 0) await sleep(1_100);
    results.push(await geocodeJobById(store, id, {
      replaceStale: body.replaceStale === true,
      geocodeOptions: { userAgent: GEOCODE_USER_AGENT },
    }));
  }
  return json({ results });
});
