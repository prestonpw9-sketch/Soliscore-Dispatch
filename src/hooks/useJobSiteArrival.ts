import { useCallback, useEffect, useRef, useState } from 'react';
import type { Job } from '@/lib/data';
import { loadJobGeofence } from '@/lib/geofence/nativeClient';
import {
  arrivalDismissalKey,
  jobSitesForArrival,
  nearestArrival,
  type JobSite,
} from '@/lib/geofence/sites';
import {
  isWithinWorkHours,
  loadWorkHours,
  phoenixToday,
  type WorkHoursConfig,
} from '@/lib/geofence/workHours';

export type ArrivalPrompt =
  | { kind: 'permission' }
  | { kind: 'denied' }
  | { kind: 'arrival'; jobId: string; jobName: string };

export type ArrivalWatch =
  | 'off-hours'
  | 'no-sites'
  | 'needs-permission'
  | 'denied'
  | 'watching'
  | 'arrived';

type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

async function webPermission(): Promise<GeoPermission> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  const permissions = navigator.permissions;
  if (!permissions?.query) return 'prompt';
  try {
    const status = await permissions.query({ name: 'geolocation' });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state;
    }
  } catch {
    return 'prompt';
  }
  return 'prompt';
}

function readPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
    );
  });
}

function isDismissed(day: string, jobId: string): boolean {
  try {
    return localStorage.getItem(arrivalDismissalKey(day, jobId)) === '1';
  } catch {
    return false;
  }
}

function rememberDismissal(day: string, jobId: string): void {
  try {
    localStorage.setItem(arrivalDismissalKey(day, jobId), '1');
  } catch { /* private mode */ }
}

const PERMISSION_DISMISS = 'itdg-arrival-permission-dismissed';

function permissionDismissed(): boolean {
  try {
    return sessionStorage.getItem(PERMISSION_DISMISS) === '1';
  } catch {
    return false;
  }
}

function rememberPermissionDismissed(): void {
  try {
    sessionStorage.setItem(PERMISSION_DISMISS, '1');
  } catch { /* private mode */ }
}

interface Options {
  onOpenTimeCard: (jobId: string) => void;
}

export function useJobSiteArrival(jobs: Job[], options: Options) {
  const [prompt, setPrompt] = useState<ArrivalPrompt | null>(null);
  const [watch, setWatch] = useState<ArrivalWatch>('no-sites');
  const onOpenRef = useRef(options.onOpenTimeCard);
  onOpenRef.current = options.onOpenTimeCard;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const dismiss = useCallback((jobId?: string) => {
    if (jobId) rememberDismissal(phoenixToday(), jobId);
    else rememberPermissionDismissed();
    setPrompt(null);
    setWatch(current => (current === 'arrived' ? 'watching' : current));
  }, []);

  const showArrival = useCallback((site: JobSite) => {
    const day = phoenixToday();
    if (isDismissed(day, site.id)) {
      setWatch('watching');
      return;
    }
    setWatch('arrived');
    setPrompt({ kind: 'arrival', jobId: site.id, jobName: site.name });
  }, []);

  const allowLocation = useCallback(() => {
    void (async () => {
      const hours = loadWorkHours();
      if (!isWithinWorkHours(new Date(), hours)) {
        setWatch('off-hours');
        setPrompt(null);
        return;
      }
      const sites = jobSitesForArrival(jobsRef.current, phoenixToday());
      const native = await loadJobGeofence();
      if (native) {
        try {
          const access = await native.requestAccess();
          if (access.location !== 'granted') {
            setWatch('denied');
            setPrompt({ kind: 'denied' });
            return;
          }
          await native.sync({ sites, workHours: hours });
          setWatch('watching');
          setPrompt(null);
          return;
        } catch (err) {
          console.error('Job geofence permission failed:', err);
        }
      }
      const position = await readPosition();
      if (!position) {
        setWatch('denied');
        setPrompt({ kind: 'denied' });
        return;
      }
      const hit = nearestArrival(position.latitude, position.longitude, sites);
      if (hit) showArrival(hit);
      else {
        setWatch('watching');
        setPrompt(null);
      }
    })();
  }, [showArrival]);

  useEffect(() => {
    let removed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    void (async () => {
      const native = await loadJobGeofence();
      if (!native || removed) return;
      listener = await native.addListener('arrival', event => {
        if (!event.jobId) return;
        if (event.open) {
          onOpenRef.current(event.jobId);
          return;
        }
        showArrival({
          id: event.jobId,
          name: event.jobName || 'this job',
          latitude: 0,
          longitude: 0,
          radiusMeters: 0,
        });
      });
    })();
    return () => {
      removed = true;
      void listener?.remove();
    };
  }, [showArrival]);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const hours: WorkHoursConfig = loadWorkHours();
      const now = new Date();
      if (!isWithinWorkHours(now, hours)) {
        if (cancelled) return;
        setWatch('off-hours');
        setPrompt(null);
        const native = await loadJobGeofence();
        if (native) {
          try {
            const sites = jobSitesForArrival(jobsRef.current, phoenixToday(now));
            if (sites.length === 0) await native.stop();
            else await native.sync({ sites, workHours: hours });
          } catch (err) {
            console.error('Could not stop job geofences:', err);
          }
        }
        return;
      }

      const sites = jobSitesForArrival(jobsRef.current, phoenixToday(now));
      if (sites.length === 0) {
        if (cancelled) return;
        setWatch('no-sites');
        setPrompt(null);
        return;
      }

      const native = await loadJobGeofence();
      if (native) {
        try {
          const access = await native.checkAccess();
          if (cancelled) return;
          if (access.location !== 'granted') {
            const denied = access.location === 'denied';
            setWatch(denied ? 'denied' : 'needs-permission');
            setPrompt(permissionDismissed() ? null : (denied ? { kind: 'denied' } : { kind: 'permission' }));
            return;
          }
          await native.sync({ sites, workHours: hours });
          const pending = await native.consumePendingArrival();
          if (cancelled) return;
          if (pending.open && pending.jobId) {
            onOpenRef.current(pending.jobId);
          }
          setWatch('watching');
          return;
        } catch (err) {
          console.error('Native job geofence sync failed; checking in the open app instead.', err);
        }
      }

      const permission = await webPermission();
      if (cancelled) return;
      if (permission === 'denied' || permission === 'unsupported') {
        setWatch('denied');
        setPrompt(permissionDismissed() ? null : { kind: 'denied' });
        return;
      }
      if (permission !== 'granted') {
        setWatch('needs-permission');
        setPrompt(permissionDismissed() ? null : { kind: 'permission' });
        return;
      }

      const position = await readPosition();
      if (cancelled) return;
      if (!position) {
        setWatch('watching');
        return;
      }
      const hit = nearestArrival(position.latitude, position.longitude, sites);
      if (hit) showArrival(hit);
      else {
        setWatch('watching');
        setPrompt(current => (current?.kind === 'arrival' ? null : current));
      }
    };

    void tick();
    const timer = window.setInterval(() => { void tick(); }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    const onHours = () => { void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('itdg-work-hours', onHours);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('itdg-work-hours', onHours);
    };
  }, [jobs, showArrival]);

  return { prompt, watch, allowLocation, dismiss };
}
