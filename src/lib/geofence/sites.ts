import type { Job } from '../data';
import { distanceMeters } from './distance.ts';

/** About 300 feet. Matches public.jobs.geofence_radius_m. */
export const DEFAULT_GEOFENCE_RADIUS_M = 90;

/** About 100 feet. Smaller than this is mostly GPS noise. */
export const MIN_GEOFENCE_RADIUS_M = 30;

/** About 650 feet. Wider than this starts to overlap the next job. */
export const MAX_GEOFENCE_RADIUS_M = 200;

export function clampRadius(meters: number | null | undefined): number {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return DEFAULT_GEOFENCE_RADIUS_M;
  return Math.min(MAX_GEOFENCE_RADIUS_M, Math.max(MIN_GEOFENCE_RADIUS_M, meters));
}

/** iOS region monitoring allows 20 regions per app. */
export const IOS_GEOFENCE_LIMIT = 20;

/** Play Services allows 100 geofences per app. */
export const ANDROID_GEOFENCE_LIMIT = 100;

export interface JobSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export function finiteOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function arrivalJobLabel(name: string): string {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  return cleaned || 'this job';
}

/** Same sentence the Android and iOS notifiers show. */
export function arrivalNotificationBody(jobName: string): string {
  return `You're at ${arrivalJobLabel(jobName)}, update your time card?`;
}

export function arrivalDismissalKey(day: string, jobId: string): string {
  return `itdg-arrival-dismissed:${day}:${jobId}`;
}

export function jobSitesForArrival(jobs: Job[], day: string): JobSite[] {
  const sites: JobSite[] = [];
  for (const job of jobs) {
    if (job.status === 'completed') continue;
    const latitude = finiteOrNull(job.latitude);
    const longitude = finiteOrNull(job.longitude);
    if (latitude == null || longitude == null) continue;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;
    const end = job.endDate ?? job.date;
    if (!job.date || job.date > day || end < day) continue;
    const radiusMeters = clampRadius(finiteOrNull(job.geofenceRadiusM));
    sites.push({
      id: job.id,
      name: arrivalJobLabel(job.customerName),
      latitude,
      longitude,
      radiusMeters,
    });
  }
  return sites;
}

export function nearestArrival(
  latitude: number,
  longitude: number,
  sites: JobSite[],
): JobSite | null {
  let best: { site: JobSite; distance: number } | null = null;
  for (const site of sites) {
    const distance = distanceMeters(latitude, longitude, site.latitude, site.longitude);
    if (distance > site.radiusMeters) continue;
    if (!best || distance < best.distance) best = { site, distance };
  }
  return best?.site ?? null;
}
