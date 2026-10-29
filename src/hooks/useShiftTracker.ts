import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Job } from '@/lib/data';
import { isNativeDispatchApp, loadJobGeofence } from '@/lib/geofence/nativeClient';
import { jobSitesForArrival } from '@/lib/geofence/sites';
import { loadWorkHours, phoenixToday, saveWorkHours, type WorkHoursConfig } from '@/lib/geofence/workHours';
import { useAuth } from '@/lib/AuthContext';
import { step } from '@/lib/shift/machine';
import { rowsFromTransition, shopRow } from '@/lib/shift/rows';
import {
  SHIFT_BATTERY_EVERY_MS,
  SHIFT_SPEED_SUSTAIN_MS,
  loadConsent,
  loadDwellMs,
  loadMachine,
  loadOutbox,
  loadShop,
  loadSpeedMph,
  saveConsent,
  saveDwellMs,
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
  notAtShopMessage,
  otherStartErrorMessage,
  permissionCheckTimeoutMessage,
  permissionDeniedMessage,
  pluginMissingMessage,
  withDeadline,
  type LocateFailure,
  type NativePositionResult,
  type StartFix,
} from '@/lib/shift/locate';
import { enqueueAndSync, syncOutbox } from '@/lib/shift/sync';
import { supabase } from '@/lib/supabase';
import type { Fix, MachineState, ShopLocation, TimeSegment } from '@/lib/shift/types';

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

async function readNativePosition(
  options: { enableHighAccuracy: boolean; maximumAge: number; timeoutMs: number },
  signal: AbortSignal,
): Promise<NativePositionResult> {
  const loaded = await withDeadline(() => loadJobGeofence(), 5_000, signal);
  if (isCancelled(loaded)) return { ok: false, reason: 'timeout' };
  if (isTimedOut(loaded) || loaded == null || !loaded.getCurrentPosition) {
    return { ok: false, reason: 'plugin-missing' };
  }
  const plugin = loaded;
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
  if (isCancelled(reading) || isTimedOut(reading)) return { ok: false, reason: 'timeout' };
  return reading;
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

export function useShiftTracker(jobs: Job[]): ShiftTracker {
  const { session, isOwner } = useAuth();
  const [machine, setMachine] = useState<MachineState>(() => loadMachine());
  const [shop, setShop] = useState<ShopLocation | null>(() => loadShop());
  const [safety, setSafety] = useState<WorkHoursConfig>(() => loadWorkHours());
  const [dwellMs, setDwellMs] = useState(() => loadDwellMs());
  const [speedMph, setSpeedMph] = useState(() => loadSpeedMph());
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
  const userId = session?.user.id ?? null;
  const userRef = useRef(userId);
  userRef.current = userId;
  const lastSpeed = useRef<number | null>(null);

  const sites = useMemo(
    () => jobSitesForArrival(jobs, phoenixToday()),
    [jobs],
  );
  const sitesRef = useRef(sites);
  sitesRef.current = sites;

  const config = useCallback(() => ({
    shop: shopRef.current,
    sites: sitesRef.current,
    speedMph: speedRef.current,
    speedSustainMs: SHIFT_SPEED_SUSTAIN_MS,
    dwellMs: dwellRef.current,
    batteryEveryMs: SHIFT_BATTERY_EVERY_MS,
    safety: safetyRef.current,
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

  const begin = useCallback(async () => {
    if (startingRef.current) return;
    const shopNow = shopRef.current;
    if (!shopNow) {
      setNotice(otherStartErrorMessage('no-shop'));
      return;
    }
    if (machineRef.current.shift && !machineRef.current.shift.endedAt) {
      setNotice(otherStartErrorMessage('already-started'));
      return;
    }
    const abort = new AbortController();
    startAbortRef.current = abort;
    startingRef.current = true;
    setStarting(true);
    setNotice('Getting your location…');
    try {
      if (isNativeDispatchApp()) {
        const loaded = await withDeadline(() => loadJobGeofence(), 5_000, abort.signal);
        if (isCancelled(loaded)) {
          setNotice(locationRequestCancelledMessage());
          return;
        }
        if (isTimedOut(loaded) || loaded == null || !loaded.requestAccess) {
          setNotice(pluginMissingMessage());
          return;
        }
        const plugin = loaded;
        const access = await withDeadline(
          () => plugin.requestAccess().then(
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
          setNotice(permissionCheckTimeoutMessage());
          return;
        }
        if ('failed' in access) {
          setNotice(locateFailureMessage(access.failed.reason));
          return;
        }
        if (access.status.location !== 'granted') {
          setNotice(permissionDeniedMessage());
          return;
        }
      }

      // Thunk keeps the deadline armed before watchPosition. Passing the
      // promise itself starts the WebView request first, and that request
      // can swallow the 30s timer on Android.
      const located = await withDeadline(() => acquireStartFix({
        nativePosition: isNativeDispatchApp()
          ? options => readNativePosition(options, abort.signal)
          : undefined,
        watch: browserStartWatch(),
        coarsePosition: () => {
          if (!isNativeDispatchApp()) return readCoarseFix();
          return readNativePosition(
            { enableHighAccuracy: false, maximumAge: 60_000, timeoutMs: 10_000 },
            abort.signal,
          ).then(result => {
            if (result.ok === false) throw new Error(result.reason);
            return result.fix;
          });
        },
      }, {
        accuracyGoalM: shopNow.radiusMeters,
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
        setNotice(gpsTimeoutMessage());
        return;
      }
      if (located.ok === false) {
        setNotice(locateFailureMessage(located.reason));
        return;
      }

      const batteryReading = await withDeadline(() => readBatteryPercent(), 3_000, abort.signal);
      const battery = typeof batteryReading === 'number' ? batteryReading : null;
      const fix: Fix = {
        at: Date.now(),
        latitude: located.fix.latitude,
        longitude: located.fix.longitude,
        speedMps: located.fix.speedMps,
        accuracyM: located.fix.accuracyM,
        batteryPercent: battery,
      };
      const prev = machineRef.current;
      const result = step(prev, { type: 'clock-in', fix }, config(), () => crypto.randomUUID());
      if (result.error === 'not-at-shop') {
        setNotice(notAtShopMessage(
          result.distanceM ?? 0,
          result.accuracyM ?? fix.accuracyM ?? null,
          shopNow.radiusMeters,
        ));
        return;
      }
      if (result.error) {
        setNotice(otherStartErrorMessage(result.error));
        return;
      }
      lastSpeed.current = fix.speedMps;
      publish(prev, result.state);
      if (isNativeDispatchApp()) {
        setNotice('Shift started. Allow all the time when the phone asks so tracking continues with the screen off. While-in-use still records this shift with the app open.');
        try {
          const plugin = await loadJobGeofence();
          if (plugin?.requestBackgroundAccess) {
            void withDeadline(() => plugin.requestBackgroundAccess(), 8_000).then(result => {
              if (isTimedOut(result)) {
                setNotice('Shift started. The background location prompt timed out. Tracking continues while the app is open. To allow all the time: Settings, Apps, ITDG Dispatch, Permissions, Location.');
              }
            });
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : 'unknown error';
          setNotice(`Shift started, but background location was not requested (${detail}). Tracking continues while the app is open.`);
        }
      } else {
        setNotice(null);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      setNotice(`Could not start the shift (${detail}). Try again.`);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [config, publish]);

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
      latitude: position?.latitude ?? last?.latitude ?? 0,
      longitude: position?.longitude ?? last?.longitude ?? 0,
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
  };
}

export function activeKind(segments: TimeSegment[]): TimeSegment | null {
  const last = segments[segments.length - 1];
  if (!last || last.endedAt) return null;
  return last;
}
