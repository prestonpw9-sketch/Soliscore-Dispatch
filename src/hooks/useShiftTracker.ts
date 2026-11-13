import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Job } from '@/lib/data';
import { geolocationFromBridge, isNativeDispatchApp, jobGeofenceFromBridge, loadJobGeofence } from '@/lib/geofence/nativeClient';
import { distanceMeters } from '@/lib/geofence/distance';
import { arrivalJobLabel, clampRadius, jobSitesForArrival, type JobSite } from '@/lib/geofence/sites';
import { loadWorkHours, phoenixToday, saveWorkHours, type WorkHoursConfig } from '@/lib/geofence/workHours';
import { useAuth } from '@/lib/AuthContext';
import {
  checkClaimedStart,
  claimedStartFromClock,
  formatPhoenixTime,
  isLateStart,
  lateStartFromSettingsRow,
  startNeedsPrompt,
  type LateStartConfig,
} from '@/lib/shift/lateStart';
import { skipClockInReminderToday } from '@/lib/shift/reminderNative';
import { countsAsInside, step } from '@/lib/shift/machine';
import { rowsFromTransition, shopRow } from '@/lib/shift/rows';
import {
  SHIFT_BATTERY_EVERY_MS,
  SHIFT_SPEED_SUSTAIN_MS,
  loadConsent,
  loadDwellMs,
  loadLateStart,
  loadLunch,
  loadMachine,
  loadOutbox,
  loadShop,
  STATE_KEY,
  loadSpeedMph,
  saveConsent,
  saveDwellMs,
  saveLateStart,
  saveLunch,
  saveMachine,
  saveShop,
  saveSpeedMph,
} from '@/lib/shift/storage';
import {
  acquireStartFix,
  browserStartWatch,
  consentCancelledMessage,
  gpsTimeoutMessage,
  isCancelled,
  isTimedOut,
  locateFailureMessage,
  locationRequestCancelledMessage,
  nativeFailureReason,
  otherStartErrorMessage,
  permissionCheckTimeoutMessage,
  permissionDeniedMessage,
  withDeadline,
  type LocateFailure,
  type NativePositionResult,
  type StartFix,
} from '@/lib/shift/locate';
import { lunchFromSettingsRow, type LunchConfig } from '@/lib/shift/lunch';
import { reconcile, repairLocal, type ServerSegmentRow, type ServerShiftRow } from '@/lib/shift/reconcile';
import { enqueueAndSync, syncOutbox } from '@/lib/shift/sync';
import { supabase } from '@/lib/supabase';
import type { ClockInOptions, Fix, MachineState, ShopLocation, TimeSegment } from '@/lib/shift/types';

/** Shown when the worker is away from the shop, late, or has no location. */
export interface StartPrompt {
  offSite: boolean;
  late: boolean;
  noFix: boolean;
  /** Meters from the shop, when known. */
  distanceM: number | null;
  /** Why there is no location, when there is none. */
  locationProblem: string | null;
  /** "I started earlier" needs the server columns. */
  canBackdate: boolean;
  /** "4:00 AM" */
  earliestLabel: string;
  /** "07:42" for the time input's max. */
  nowHhmm: string;
  error: string | null;
  busy: boolean;
}

export type StartChoice =
  | { mode: 'now'; reason?: string }
  | { mode: 'earlier'; time: string; reason?: string };

export interface ShiftTracker {
  tracking: boolean;
  shop: ShopLocation | null;
  segments: TimeSegment[];
  shift: MachineState['shift'];
  notice: string | null;
  syncStatus: 'synced' | 'pending' | 'offline';
  consentOpen: boolean;
  safety: WorkHoursConfig;
  dwellMinutes: number;
  speedMph: number;
  /** Company lunch window from payroll_settings. */
  lunch: LunchConfig;
  saveShop: (shop: ShopLocation) => void;
  saveSafety: (patch: Partial<WorkHoursConfig>) => void;
  saveDwellMinutes: (minutes: number) => void;
  saveSpeed: (mph: number) => void;
  requestStart: () => void;
  acceptConsentAndStart: () => void;
  dismissConsent: () => void;
  cancelStart: () => void;
  clockOut: () => void;
  starting: boolean;
  lateStart: LateStartConfig;
  /** Active jobs to pick at clock-in. */
  startJobs: Array<{ id: string; label: string }>;
  startJobId: string;
  setStartJobId: (jobId: string) => void;
  startPrompt: StartPrompt | null;
  confirmStart: (choice: StartChoice) => void;
  dismissStartPrompt: () => void;
}

function hhmmPhoenix(atMs: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Phoenix',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(atMs));
}

function jobLabel(job: Job): string {
  const name = job.customerName?.trim() || 'Job';
  const address = job.address?.trim();
  return address ? `${name} — ${address}` : name;
}

/** The picked job's fence, when it has a pin and is not already in today's list. */
function siteForJob(jobs: Job[], jobId: string | null | undefined, sites: JobSite[]): JobSite | null {
  if (!jobId || sites.some(site => site.id === jobId)) return null;
  const job = jobs.find(item => item.id === jobId);
  const latitude = job?.latitude;
  const longitude = job?.longitude;
  if (!job || typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    id: job.id,
    name: arrivalJobLabel(job.customerName),
    latitude,
    longitude,
    radiusMeters: clampRadius(job.geofenceRadiusM ?? null),
  };
}

async function readBatteryPercent(): Promise<number | null> {
  if (isNativeDispatchApp()) {
    try {
      const plugin = await loadJobGeofence();
      const reading = await plugin?.getBattery();
      if (reading && Number.isFinite(reading.percent)) return reading.percent;
    } catch { /* browser fallback */ }
  }
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
  try {
    if (!nav.getBattery) return null;
    const battery = await nav.getBattery();
    if (!Number.isFinite(battery.level) || battery.level < 0) return null;
    return Math.round(battery.level * 100);
  } catch {
    return null;
  }
}

function readPosition(): Promise<{ latitude: number; longitude: number; speedMps: number | null; accuracyM: number | null } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        speedMps: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8_000 },
    );
  });
}

function locateErrorReason(err: unknown): { ok: false; reason: Exclude<LocateFailure, 'cancelled'> } {
  return { ok: false, reason: nativeFailureReason(err) };
}

function positionFromPlugin(reading: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  time?: number | null;
}): StartFix {
  return {
    latitude: reading.latitude,
    longitude: reading.longitude,
    accuracyM: reading.accuracy ?? null,
    speedMps: reading.speed ?? null,
    at: reading.time ?? Date.now(),
  };
}

function bridgeCap() {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { Capacitor?: Parameters<typeof jobGeofenceFromBridge>[0] }).Capacitor;
}

function positionFromGeolocation(reading: {
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  speed?: number | null;
  coords?: { latitude?: number; longitude?: number; accuracy?: number | null; speed?: number | null };
  timestamp?: number;
}): StartFix | null {
  const coords = reading.coords;
  const latitude = coords?.latitude ?? reading.latitude;
  const longitude = coords?.longitude ?? reading.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  return {
    latitude,
    longitude,
    accuracyM: coords?.accuracy ?? reading.accuracy ?? null,
    speedMps: coords?.speed ?? reading.speed ?? null,
    at: reading.timestamp ?? Date.now(),
  };
}

async function readNativePosition(
  options: { enableHighAccuracy: boolean; maximumAge: number; timeoutMs: number },
  signal: AbortSignal,
): Promise<NativePositionResult> {
  const cap = bridgeCap();
  const plugin = jobGeofenceFromBridge(cap);
  if (plugin?.getCurrentPosition) {
    const reading = await withDeadline(
      () => plugin.getCurrentPosition({
        enableHighAccuracy: options.enableHighAccuracy,
        maximumAge: options.maximumAge,
        timeout: options.timeoutMs,
      }).then(
        value => ({ ok: true as const, fix: positionFromPlugin(value) }),
        (err: unknown) => locateErrorReason(err),
      ),
      options.timeoutMs,
      signal,
    );
    if (isCancelled(reading)) return { ok: false, reason: 'timeout' };
    if (!isTimedOut(reading) && !(reading.ok === false && reading.reason === 'plugin-missing')) return reading;
  }
  const geolocation = geolocationFromBridge(cap);
  if (geolocation?.getCurrentPosition) {
    const reading = await withDeadline(
      () => geolocation.getCurrentPosition({
        enableHighAccuracy: options.enableHighAccuracy,
        maximumAge: options.maximumAge,
        timeout: options.timeoutMs,
      }).then(
        value => {
          const fix = positionFromGeolocation(value);
          return fix ? { ok: true as const, fix } : { ok: false as const, reason: 'unavailable' as const };
        },
        (err: unknown) => locateErrorReason(err),
      ),
      options.timeoutMs,
      signal,
    );
    if (isCancelled(reading)) return { ok: false, reason: 'timeout' };
    if (!isTimedOut(reading)) return reading;
  }
  return { ok: false, reason: 'plugin-missing' };
}

function readCoarseFix(): Promise<StartFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        speedMps: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        at: Date.now(),
      }),
      error => reject(error),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  });
}

/**
 * Location points the phone already has for a backdated gap. The native
 * tracker only queues points while a shift is open (and the queue is drained
 * at every start), and neither Android nor iOS lets an app read the OS
 * location history, so this is usually empty. The start fix itself counts
 * when it was a cached reading from inside the gap. Nothing is invented.
 */
async function readGapHistory(fromMs: number, toMs: number, startFix: StartFix | null): Promise<Fix[]> {
  const points: Fix[] = [];
  if (isNativeDispatchApp()) {
    try {
      const plugin = await loadJobGeofence();
      if (plugin) {
        const drained = await withDeadline(() => plugin.drainSamples(), 3_000);
        if (!isTimedOut(drained) && !isCancelled(drained)) {
          for (const sample of drained?.samples ?? []) points.push(sample);
        }
      }
    } catch (err) {
      console.error('Reading saved location points failed:', err);
    }
  }
  if (startFix && Number.isFinite(startFix.at) && startFix.at < toMs - 60_000) {
    points.push({
      at: startFix.at,
      latitude: startFix.latitude,
      longitude: startFix.longitude,
      speedMps: startFix.speedMps,
      accuracyM: startFix.accuracyM,
      batteryPercent: null,
    });
  }
  return points
    .filter(point => point.at >= fromMs && point.at < toMs)
    .sort((a, b) => a.at - b.at);
}

export function useShiftTracker(jobs: Job[]): ShiftTracker {
  const { session, isOwner } = useAuth();
  const [machine, setMachine] = useState<MachineState>(() => repairLocal(loadMachine()));
  const [shop, setShop] = useState<ShopLocation | null>(() => loadShop());
  const [safety, setSafety] = useState<WorkHoursConfig>(() => loadWorkHours());
  const [dwellMs, setDwellMs] = useState(() => loadDwellMs());
  const [speedMph, setSpeedMph] = useState(() => loadSpeedMph());
  const [lunch, setLunch] = useState<LunchConfig>(() => loadLunch());
  const [lateStart, setLateStart] = useState<LateStartConfig>(() => loadLateStart());
  const [startJobId, setStartJobId] = useState('');
  const [startPrompt, setStartPrompt] = useState<StartPrompt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'offline'>(
    () => (loadOutbox().length ? 'pending' : 'synced'),
  );
  const [consentOpen, setConsentOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const startAbortRef = useRef<AbortController | null>(null);
  const machineRef = useRef(machine);
  machineRef.current = machine;
  const shopRef = useRef(shop);
  shopRef.current = shop;
  const safetyRef = useRef(safety);
  safetyRef.current = safety;
  const dwellRef = useRef(dwellMs);
  dwellRef.current = dwellMs;
  const speedRef = useRef(speedMph);
  speedRef.current = speedMph;
  const lunchRef = useRef(lunch);
  lunchRef.current = lunch;
  const lateRef = useRef(lateStart);
  lateRef.current = lateStart;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const startJobRef = useRef(startJobId);
  startJobRef.current = startJobId;
  /** Location (or none) read for a start that is waiting on the prompt. */
  const pendingStartRef = useRef<{ fix: StartFix | null; battery: number | null } | null>(null);
  const userId = session?.user.id ?? null;
  const userRef = useRef(userId);
  userRef.current = userId;
  const lastSpeed = useRef<number | null>(null);

  // Today's fences, plus the job picked at clock-in if it has a pin.
  const pickedJobId = machine.shift && !machine.shift.endedAt ? machine.shift.clockIn?.startJobId ?? null : null;
  const sites = useMemo(() => {
    const today = jobSitesForArrival(jobs, phoenixToday());
    const picked = siteForJob(jobs, pickedJobId, today);
    return picked ? [...today, picked] : today;
  }, [jobs, pickedJobId]);
  const sitesRef = useRef(sites);
  sitesRef.current = sites;

  const startJobs = useMemo(() => {
    const today = phoenixToday();
    const onToday = (job: Job) => Boolean(job.date) && job.date <= today && (job.endDate ?? job.date) >= today;
    return jobs
      .filter(job => job.status !== 'completed')
      .sort((a, b) => Number(onToday(b)) - Number(onToday(a)) || jobLabel(a).localeCompare(jobLabel(b)))
      .map(job => ({ id: job.id, label: jobLabel(job) }));
  }, [jobs]);

  const config = useCallback(() => ({
    shop: shopRef.current,
    sites: sitesRef.current,
    speedMph: speedRef.current,
    speedSustainMs: SHIFT_SPEED_SUSTAIN_MS,
    dwellMs: dwellRef.current,
    batteryEveryMs: SHIFT_BATTERY_EVERY_MS,
    safety: safetyRef.current,
    lunch: lunchRef.current,
    lateStart: lateRef.current,
  }), []);

  const publish = useCallback((prev: MachineState, next: MachineState) => {
    machineRef.current = next;
    setMachine(next);
    saveMachine(next);
    const uid = userRef.current;
    if (!uid) {
      setSyncStatus(loadOutbox().length ? 'pending' : 'synced');
      return;
    }
    const rows = rowsFromTransition(uid, prev, next);
    void enqueueAndSync(rows).then(setSyncStatus);
  }, []);

  const applyFix = useCallback((type: 'sample' | 'clock-out', fix: Fix) => {
    const prev = machineRef.current;
    const result = step(prev, { type, fix }, config(), () => crypto.randomUUID());
    if (result.error) {
      setNotice(otherStartErrorMessage(result.error));
      return;
    }
    if (result.state === prev) return;
    lastSpeed.current = fix.speedMps;
    publish(prev, result.state);
  }, [config, publish]);

  /** Open the start prompt (away from the shop, late, or no location). */
  const openPrompt = useCallback((
    fix: StartFix | null,
    battery: number | null,
    details: { offSite: boolean; late: boolean; distanceM: number | null; locationProblem: string | null },
  ) => {
    const rules = lateRef.current;
    pendingStartRef.current = { fix, battery };
    setNotice(null);
    setStartPrompt({
      ...details,
      noFix: fix == null,
      canBackdate: rules.ready,
      earliestLabel: formatPhoenixTime(claimedStartFromClock(
        `${String(Math.floor(rules.earliestMinute / 60)).padStart(2, '0')}:${String(rules.earliestMinute % 60).padStart(2, '0')}`,
        Date.now(),
        rules,
      ) ?? Date.now()),
      nowHhmm: hhmmPhoenix(Date.now()),
      error: null,
      busy: false,
    });
  }, []);

  /** Location could not be read. Clock-in still goes ahead once the server allows unlocated starts. */
  const locationFailed = useCallback((message: string) => {
    if (!lateRef.current.ready) {
      setNotice(message);
      return;
    }
    openPrompt(null, null, {
      offSite: true,
      late: isLateStart(Date.now(), lateRef.current),
      distanceM: null,
      locationProblem: message,
    });
  }, [openPrompt]);

  /** Clock in with the location read in `begin` (or none). */
  const commitStart = useCallback(async (choice: StartChoice) => {
    const pending = pendingStartRef.current;
    if (!pending) return;
    if (machineRef.current.shift && !machineRef.current.shift.endedAt) {
      setStartPrompt(null);
      setNotice(otherStartErrorMessage('already-started'));
      return;
    }
    const rules = lateRef.current;
    const tapAt = Date.now();
    const jobId = startJobRef.current || null;
    const job = jobId ? jobsRef.current.find(item => item.id === jobId) ?? null : null;
    const located = pending.fix;
    const fix: Fix = located
      ? {
        at: tapAt,
        latitude: located.latitude,
        longitude: located.longitude,
        speedMps: located.speedMps,
        accuracyM: located.accuracyM,
        batteryPercent: pending.battery,
      }
      : { at: tapAt, latitude: NaN, longitude: NaN, speedMps: null, accuracyM: null, batteryPercent: pending.battery };

    const options: ClockInOptions = {
      jobId,
      jobName: job ? arrivalJobLabel(job.customerName) : null,
      noFix: !located,
      reason: choice.reason?.trim() || null,
    };
    if (choice.mode === 'earlier') {
      const claimed = claimedStartFromClock(choice.time, tapAt, rules);
      const previous = machineRef.current.shift?.endedAt ? Date.parse(machineRef.current.shift.endedAt) : null;
      const check = claimed == null
        ? { ok: false as const, message: 'Pick the time you started.' }
        : checkClaimedStart(claimed, tapAt, rules, previous);
      if (check.ok === false) {
        setStartPrompt(prompt => (prompt ? { ...prompt, error: check.message } : prompt));
        return;
      }
      setStartPrompt(prompt => (prompt ? { ...prompt, error: null, busy: true } : prompt));
      options.claimedStartAt = check.startAt;
      options.history = await readGapHistory(check.startAt, tapAt, located);
    }

    const prev = machineRef.current;
    const pickedSite = siteForJob(jobsRef.current, jobId, sitesRef.current);
    const result = step(
      prev,
      { type: 'clock-in', fix, options },
      { ...config(), sites: pickedSite ? [...sitesRef.current, pickedSite] : sitesRef.current },
      () => crypto.randomUUID(),
    );
    if (result.error === 'bad-start-time') {
      setStartPrompt(prompt => (prompt ? { ...prompt, error: result.message ?? 'Pick a different start time.', busy: false } : prompt));
      return;
    }
    if (result.error) {
      setStartPrompt(null);
      setNotice(result.error === 'late-start-unavailable'
        ? 'Could not start without a location yet. Try again in a moment.'
        : otherStartErrorMessage(result.error));
      return;
    }
    pendingStartRef.current = null;
    setStartPrompt(null);
    setStartJobId('');
    lastSpeed.current = fix.speedMps;
    publish(prev, result.state);

    const startedAt = result.state.shift ? Date.parse(result.state.shift.startedAt) : tapAt;
    const parts = [`Shift started at ${formatPhoenixTime(startedAt)}.`];
    if (choice.mode === 'earlier' && startedAt < tapAt) {
      parts.push((result.historyPoints ?? 0) > 0
        ? 'The time before you tapped Start was filled in from saved locations.'
        : 'No saved locations cover the time before you tapped Start, so it is marked unverified for a supervisor to check.');
    }
    if (!located) parts.push('No location yet. Time is marked unverified until the phone gets a fix.');
    const summary = parts.join(' ');

    if (isNativeDispatchApp()) {
      // Already clocked in: today's 6:00 reminder is not needed (iPhone only; best effort).
      void skipClockInReminderToday();
      setNotice(`${summary} Allow all the time when the phone asks so tracking continues with the screen off. While-in-use still records this shift with the app open.`);
      try {
        const plugin = await loadJobGeofence();
        if (plugin?.requestBackgroundAccess) {
          void withDeadline(() => plugin.requestBackgroundAccess(), 8_000).then(outcome => {
            if (isTimedOut(outcome)) {
              setNotice(`${summary} The background location prompt timed out. Tracking continues while the app is open. To allow all the time: Settings, Apps, ITDG Dispatch, Permissions, Location.`);
            }
          });
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown error';
        setNotice(`${summary} Background location was not requested (${detail}). Tracking continues while the app is open.`);
      }
    } else {
      setNotice(choice.mode === 'earlier' || !located || result.offSite ? summary : null);
    }
  }, [config, publish]);

  const begin = useCallback(async () => {
    if (startingRef.current) return;
    if (machineRef.current.shift && !machineRef.current.shift.endedAt) {
      setNotice(otherStartErrorMessage('already-started'));
      return;
    }
    const shopNow = shopRef.current;
    const abort = new AbortController();
    startAbortRef.current = abort;
    startingRef.current = true;
    setStarting(true);
    setStartPrompt(null);
    setNotice('Getting your location…');
    try {
      const bridge = isNativeDispatchApp() ? bridgeCap() : undefined;
      const geofence = jobGeofenceFromBridge(bridge);
      const capacitorGeo = geolocationFromBridge(bridge);
      if (geofence?.requestAccess) {
        const access = await withDeadline(
          () => geofence.requestAccess().then(
            status => ({ status }),
            (err: unknown) => ({ failed: locateErrorReason(err) }),
          ),
          15_000,
          abort.signal,
        );
        if (isCancelled(access)) {
          setNotice(locationRequestCancelledMessage());
          return;
        }
        if (isTimedOut(access)) {
          locationFailed(permissionCheckTimeoutMessage());
          return;
        }
        if ('failed' in access) {
          if (access.failed.reason !== 'plugin-missing') {
            locationFailed(locateFailureMessage(access.failed.reason));
            return;
          }
        } else if (access.status.location !== 'granted') {
          locationFailed(permissionDeniedMessage());
          return;
        }
      } else if (capacitorGeo?.requestPermissions) {
        const access = await withDeadline(
          () => capacitorGeo.requestPermissions().then(
            status => ({ status }),
            (err: unknown) => ({ failed: locateErrorReason(err) }),
          ),
          15_000,
          abort.signal,
        );
        if (isCancelled(access)) {
          setNotice(locationRequestCancelledMessage());
          return;
        }
        if (!isTimedOut(access) && 'failed' in access && access.failed.reason === 'denied') {
          locationFailed(permissionDeniedMessage());
          return;
        }
        if (!isTimedOut(access) && !('failed' in access) && access.status.location === 'denied') {
          locationFailed(permissionDeniedMessage());
          return;
        }
      }

      // Thunk keeps the deadline armed before watchPosition. Passing the
      // promise itself starts the WebView request first, and that request
      // can swallow the 30s timer on Android.
      const located = await withDeadline(() => acquireStartFix({
        nativePosition: geofence?.getCurrentPosition || capacitorGeo?.getCurrentPosition
          ? options => readNativePosition(options, abort.signal)
          : undefined,
        watch: browserStartWatch(),
        coarsePosition: async () => {
          if (geofence?.getCurrentPosition || capacitorGeo?.getCurrentPosition) {
            const result = await readNativePosition(
              { enableHighAccuracy: false, maximumAge: 60_000, timeoutMs: 10_000 },
              abort.signal,
            );
            if (result.ok === true) return result.fix;
            if (result.reason === 'denied' || result.reason === 'services-off') throw new Error(result.reason);
          }
          return readCoarseFix();
        },
      }, {
        accuracyGoalM: shopNow?.radiusMeters ?? 90,
        highAccuracyMs: 15_000,
        coarseMs: 10_000,
        signal: abort.signal,
        withDeadline,
      }), 30_000, abort.signal);
      if (isCancelled(located)) {
        setNotice(locationRequestCancelledMessage());
        return;
      }
      if (isTimedOut(located)) {
        locationFailed(gpsTimeoutMessage());
        return;
      }
      if (located.ok === false) {
        locationFailed(locateFailureMessage(located.reason));
        return;
      }

      const batteryReading = await withDeadline(() => readBatteryPercent(), 3_000, abort.signal);
      const battery = typeof batteryReading === 'number' ? batteryReading : null;
      // Never blocked by location: at the shop and on time starts right away;
      // anything else asks Start now / I started earlier.
      const distanceM = shopNow
        ? distanceMeters(located.fix.latitude, located.fix.longitude, shopNow.latitude, shopNow.longitude)
        : null;
      const atShop = shopNow != null && distanceM != null
        && countsAsInside(distanceM, shopNow.radiusMeters, located.fix.accuracyM);
      const late = lateRef.current.ready && isLateStart(Date.now(), lateRef.current);
      pendingStartRef.current = { fix: located.fix, battery };
      if (!startNeedsPrompt({ atShop, late })) {
        setNotice(null);
        await commitStart({ mode: 'now' });
        return;
      }
      openPrompt(located.fix, battery, { offSite: !atShop, late, distanceM, locationProblem: null });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      setNotice(`Could not start the shift (${detail}). Try again.`);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [commitStart, locationFailed, openPrompt]);

  const requestStart = useCallback(() => {
    if (startingRef.current) return;
    if (!loadConsent()) {
      setConsentOpen(true);
      return;
    }
    void begin();
  }, [begin]);

  const acceptConsentAndStart = useCallback(() => {
    saveConsent();
    setConsentOpen(false);
    void begin();
  }, [begin]);

  const clockOut = useCallback(async () => {
    const position = await readPosition();
    const battery = await readBatteryPercent();
    const last = machineRef.current.lastSample;
    const fix: Fix = {
      at: Date.now(),
      // NaN = unknown; the machine stores null rather than a 0,0 point.
      latitude: position?.latitude ?? last?.latitude ?? NaN,
      longitude: position?.longitude ?? last?.longitude ?? NaN,
      speedMps: position?.speedMps ?? 0,
      accuracyM: position?.accuracyM ?? null,
      batteryPercent: battery,
    };
    applyFix('clock-out', fix);
    if (isNativeDispatchApp()) {
      const plugin = await loadJobGeofence();
      await plugin?.stopShiftTracking();
    }
  }, [applyFix]);

  useEffect(() => {
    const shift = machine.shift;
    if (!shift || shift.endedAt) return undefined;
    let watchId = 0;
    let timer = 0;
    let cancelled = false;

    const onFix = (fix: Fix) => {
      if (!cancelled) applyFix('sample', fix);
    };

    let listener: { remove: () => Promise<void> } | undefined;
    void (async () => {
      if (isNativeDispatchApp() && shopRef.current) {
        try {
          const plugin = await loadJobGeofence();
          await plugin?.startShiftTracking({
            shop: shopRef.current,
            sites: sitesRef.current,
          });
          const drained = await plugin?.drainSamples();
          const ordered = [...(drained?.samples ?? [])].sort((a, b) => a.at - b.at);
          for (const sample of ordered) onFix(sample);
          listener = await plugin?.addListener('sample', sample => onFix(sample));
          if (cancelled) {
            void listener?.remove();
            return;
          }
        } catch (err) {
          console.error('Native shift tracking failed; using the open app instead.', err);
        }
      }
      if (cancelled) return;
      if (!isNativeDispatchApp() && navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          position => onFix({
            at: Date.now(),
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            speedMps: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
            batteryPercent: null,
          }),
          () => undefined,
          { enableHighAccuracy: true, maximumAge: 5_000 },
        );
      }
      timer = window.setInterval(() => {
        void (async () => {
          const current = machineRef.current;
          if (!current.shift || current.shift.endedAt || !current.lastSample) return;
          const battery = await readBatteryPercent();
          onFix({
            at: Date.now(),
            latitude: current.lastSample.latitude,
            longitude: current.lastSample.longitude,
            speedMps: lastSpeed.current,
            batteryPercent: battery,
          });
        })();
      }, 30_000);
    })();

    return () => {
      cancelled = true;
      if (watchId) navigator.geolocation.clearWatch(watchId);
      window.clearInterval(timer);
      void listener?.remove();
      if (isNativeDispatchApp()) {
        void loadJobGeofence().then(plugin => plugin?.stopShiftTracking());
      }
    };
  }, [applyFix, machine.shift?.id, machine.shift?.endedAt]);

  // Another tab or window wrote the shift: use its copy so two copies never
  // keep writing separate segments for one shift.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STATE_KEY) return;
      const next = repairLocal(loadMachine());
      machineRef.current = next;
      setMachine(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Line the phone's copy up with the server on sign-in and whenever the app
  // comes back to the front: shows Stop for a shift that is open on the
  // server, and closes a shift the owner already ended.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return undefined;
    let cancelled = false;
    const check = () => {
      void (async () => {
        try {
          if (loadOutbox().length) {
            const status = await syncOutbox();
            if (status !== 'synced') return; // server copy would be stale
          }
          const local = machineRef.current;
          // '*' so the late clock-in columns come along once they exist.
          const openQuery = supabase
            .from('shifts')
            .select('*')
            .eq('user_id', uid)
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1);
          const openRaced = await withDeadline(() => openQuery, 10_000);
          if (cancelled || isTimedOut(openRaced) || isCancelled(openRaced) || openRaced.error) return;
          const openShift = (openRaced.data?.[0] as ServerShiftRow | undefined) ?? null;

          let localShiftRow: ServerShiftRow | null = null;
          if (local.shift && !local.shift.endedAt) {
            const own = supabase
              .from('shifts')
              .select('id, started_at, ended_at, end_reason')
              .eq('id', local.shift.id)
              .limit(1);
            const ownRaced = await withDeadline(() => own, 10_000);
            if (cancelled || isTimedOut(ownRaced) || isCancelled(ownRaced) || ownRaced.error) return;
            localShiftRow = (ownRaced.data?.[0] as ServerShiftRow | undefined) ?? null;
          }

          let openSegments: ServerSegmentRow[] = [];
          if (openShift && !(local.shift && !local.shift.endedAt)) {
            const segQuery = supabase
              .from('time_segments')
              .select('*')
              .eq('shift_id', openShift.id)
              .order('started_at', { ascending: true });
            const segRaced = await withDeadline(() => segQuery, 10_000);
            if (cancelled || isTimedOut(segRaced) || isCancelled(segRaced) || segRaced.error) return;
            openSegments = (segRaced.data ?? []) as ServerSegmentRow[];
          }

          if (cancelled || machineRef.current !== local) return; // moved on meanwhile
          const next = reconcile(local, { localShiftRow, openShift, openSegments }, Date.now());
          if (!next) return;
          // Publishing closes any rows the server still has open.
          publish(local, next);
          if (next.shift && !next.shift.endedAt) setNotice('Picked up your open shift from the server.');
          else setNotice('This shift was already clocked out.');
        } catch (err) {
          console.error('Shift check with the server failed:', err);
        }
      })();
    };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', check);
    };
  }, [session?.user.id, publish]);

  useEffect(() => {
    const refresh = () => { void syncOutbox().then(setSyncStatus); };
    window.addEventListener('online', refresh);
    const timer = window.setInterval(refresh, 20_000);
    refresh();
    return () => {
      window.removeEventListener('online', refresh);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!session?.user.id) return undefined;
    let cancelled = false;
    const pullShop = () => {
      void (async () => {
        try {
          const query = supabase.from('shop_locations').select('id, name, latitude, longitude, radius_m').eq('active', true).limit(1);
          const raced = await withDeadline(() => query, 10_000);
          if (isTimedOut(raced) || isCancelled(raced)) return;
          const { data, error } = raced;
          if (cancelled || error || !data?.length) return;
          const row = data[0] as { id: string; name: string; latitude: number; longitude: number; radius_m: number };
          const next: ShopLocation = {
            id: String(row.id),
            name: row.name || 'Shop',
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            radiusMeters: Number(row.radius_m) || 90,
          };
          if (!Number.isFinite(next.latitude) || !Number.isFinite(next.longitude)) return;
          saveShop(next);
          setShop(next);
        } catch (err) {
          console.error('Shop location load failed:', err);
        }
      })();
    };
    pullShop();
    window.addEventListener('online', pullShop);
    return () => {
      cancelled = true;
      window.removeEventListener('online', pullShop);
    };
  }, [session?.user.id]);

  // Lunch window is a company setting. Until this read succeeds once, the
  // phone does not insert lunch rows (see LUNCH_UNCONFIRMED).
  useEffect(() => {
    if (!session?.user.id) return undefined;
    let cancelled = false;
    const pullLunch = () => {
      void (async () => {
        try {
          const query = supabase
            .from('payroll_settings')
            .select('lunch_enabled, lunch_start, lunch_end, lunch_paid')
            .limit(1);
          const raced = await withDeadline(() => query, 10_000);
          if (isTimedOut(raced) || isCancelled(raced)) return;
          const { data, error } = raced;
          if (cancelled || error || !data?.length) return;
          const next = lunchFromSettingsRow(data[0] as Record<string, unknown>);
          saveLunch(next);
          setLunch(next);
        } catch (err) {
          console.error('Lunch setting load failed:', err);
        }
      })();
    };
    pullLunch();
    window.addEventListener('online', pullLunch);
    return () => {
      cancelled = true;
      window.removeEventListener('online', pullLunch);
    };
  }, [session?.user.id]);

  // Late / off-site clock-in rules. A read that fails (columns not there yet)
  // leaves them unconfirmed, so the phone offers Start now only.
  useEffect(() => {
    if (!session?.user.id) return undefined;
    let cancelled = false;
    const pullLateStart = () => {
      void (async () => {
        try {
          const query = supabase
            .from('payroll_settings')
            .select('normal_start_time, late_grace_minutes, backdate_earliest_time')
            .limit(1);
          const raced = await withDeadline(() => query, 10_000);
          if (isTimedOut(raced) || isCancelled(raced)) return;
          const { data, error } = raced;
          if (cancelled || error || !data?.length) return;
          const next = lateStartFromSettingsRow(data[0] as Record<string, unknown>);
          saveLateStart(next);
          setLateStart(next);
        } catch (err) {
          console.error('Late clock-in setting load failed:', err);
        }
      })();
    };
    pullLateStart();
    window.addEventListener('online', pullLateStart);
    return () => {
      cancelled = true;
      window.removeEventListener('online', pullLateStart);
    };
  }, [session?.user.id]);

  const saveShopAndSync = (next: ShopLocation) => {
    saveShop(next);
    setShop(next);
    setNotice(null);
    if (isOwner) void enqueueAndSync([shopRow(next)]).then(setSyncStatus);
  };

  return {
    tracking: Boolean(machine.shift && !machine.shift.endedAt),
    shop,
    segments: machine.segments,
    shift: machine.shift,
    notice,
    syncStatus,
    consentOpen,
    safety,
    dwellMinutes: Math.round(dwellMs / 60_000),
    speedMph,
    lunch,
    saveShop: saveShopAndSync,
    saveSafety: patch => {
      const next = saveWorkHours({ ...safety, ...patch, timeZone: 'America/Phoenix' });
      setSafety(next);
    },
    saveDwellMinutes: minutes => {
      const dwell = minutes * 60_000;
      saveDwellMs(dwell);
      setDwellMs(dwell);
    },
    saveSpeed: mph => {
      saveSpeedMph(mph);
      setSpeedMph(mph);
    },
    requestStart,
    acceptConsentAndStart,
    dismissConsent: () => {
      setConsentOpen(false);
      setNotice(consentCancelledMessage());
    },
    cancelStart: () => {
      startAbortRef.current?.abort();
    },
    clockOut: () => { void clockOut(); },
    starting,
    lateStart,
    startJobs,
    startJobId,
    setStartJobId,
    startPrompt,
    confirmStart: choice => { void commitStart(choice); },
    dismissStartPrompt: () => {
      pendingStartRef.current = null;
      setStartPrompt(null);
      setNotice('Start cancelled.');
    },
  };
}

export function activeKind(segments: TimeSegment[]): TimeSegment | null {
  const last = segments[segments.length - 1];
  if (!last || last.endedAt) return null;
  return last;
}
