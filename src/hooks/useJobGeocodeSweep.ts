import { useEffect, useRef } from 'react';
import type { Job } from '@/lib/data';
import { anyPinned, jobPinState, requestJobGeocode } from '@/lib/jobGeocode';

const MAX_PER_SESSION = 20;

/**
 * Safety net for jobs that were saved but never pinned (for example an SMS
 * job whose background lookup was cut short). Owner / crew sessions ask the
 * geocode-job function for up to 10 current or upcoming unpinned jobs at a
 * time, each job at most once per page load. Older jobs are left to
 * scripts/backfill-job-geocodes.ts.
 *
 * Does nothing until the geocode migration is applied (geocodeStatus stays
 * undefined).
 */
export function useJobGeocodeSweep(
  jobs: Job[],
  enabled: boolean,
  today: string,
  onPinned: () => void,
): void {
  const tried = useRef(new Set<string>());
  const running = useRef(false);
  const onPinnedRef = useRef(onPinned);
  onPinnedRef.current = onPinned;

  useEffect(() => {
    if (!enabled || running.current || tried.current.size >= MAX_PER_SESSION) return;
    const due = jobs.filter(job => {
      if (job.geocodeStatus === undefined) return false;
      if (job.geocodeStatus !== null && job.geocodeStatus !== 'pending') return false;
      if (job.status === 'completed' || tried.current.has(job.id)) return false;
      if ((job.endDate ?? job.date) < today) return false;
      return jobPinState(job) === 'pending';
    }).slice(0, Math.min(10, MAX_PER_SESSION - tried.current.size));
    if (!due.length) return;

    for (const job of due) tried.current.add(job.id);
    running.current = true;
    void requestJobGeocode(due.map(job => job.id))
      .then(outcomes => {
        if (anyPinned(outcomes)) onPinnedRef.current();
      })
      .finally(() => {
        running.current = false;
      });
  }, [jobs, enabled, today]);
}
