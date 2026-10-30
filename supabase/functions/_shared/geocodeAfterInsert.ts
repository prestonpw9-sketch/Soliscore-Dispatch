/**
 * Geocode after the SMS path inserts a job.
 *
 * super-processor imports this lazily and runs it under
 * EdgeRuntime.waitUntil, so it cannot delay or fail the TwiML reply to the
 * superintendent. If it never runs, the app's pending-pin sweep and the
 * backfill script still cover the job.
 */

import { GEOCODE_USER_AGENT } from './geocode.ts';
import { geocodeJobById, supabaseJobStore } from './geocodeJob.ts';

// deno-lint-ignore no-explicit-any
type LooseClient = { from: (table: string) => any };

type WaitUntilRuntime = { waitUntil?: (promise: Promise<unknown>) => void };

/** Resolves when the lookup is done. Never rejects. */
export async function runJobGeocode(client: LooseClient, jobId: unknown): Promise<void> {
  try {
    if (jobId == null || !/^\d+$/.test(String(jobId))) return;
    const outcome = await geocodeJobById(supabaseJobStore(client), String(jobId), {
      geocodeOptions: { userAgent: GEOCODE_USER_AGENT, timeoutMs: 6_000 },
    });
    console.log('geocode after SMS insert', outcome);
  } catch (err) {
    console.error('geocode after SMS insert failed', err);
  }
}

/** Fire-and-forget form. Returns at once and never throws. */
export function scheduleJobGeocode(client: LooseClient, jobId: unknown): void {
  try {
    const task = runJobGeocode(client, jobId);
    const runtime = (globalThis as { EdgeRuntime?: WaitUntilRuntime }).EdgeRuntime;
    runtime?.waitUntil?.(task);
  } catch (err) {
    console.error('geocode after SMS insert was not scheduled', err);
  }
}
