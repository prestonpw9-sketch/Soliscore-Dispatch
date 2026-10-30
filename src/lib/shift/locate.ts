import { countsAsInside } from './machine.ts';

export const START_FIX_TIMEOUT_MS = 30_000;

export interface StartFix {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedMps: number | null;
  at: number;
}

export type LocateFailure = 'denied' | 'timeout' | 'unavailable' | 'services-off' | 'plugin-missing' | 'cancelled';

export type LocateResult =
  | { ok: true; fix: StartFix; quality: 'accurate' | 'best' }
  | { ok: false; reason: LocateFailure };

export type NativePositionResult =
  | { ok: true; fix: StartFix }
  | { ok: false; reason: Exclude<LocateFailure, 'cancelled'> };

export type DeadlineResult<T> = T | { timedOut: true } | { cancelled: true };

export interface GeoWatch {
  (
    onFix: (fix: StartFix) => void,
    onError: (error: LocateFailure) => void,
  ): () => void;
}

export function isTimedOut<T>(value: DeadlineResult<T>): value is { timedOut: true } {
  return typeof value === 'object' && value !== null && 'timedOut' in value && value.timedOut === true;
}

export function isCancelled<T>(value: DeadlineResult<T>): value is { cancelled: true } {
  return typeof value === 'object' && value !== null && 'cancelled' in value && value.cancelled === true;
}

export type DeadlineWork<T> = PromiseLike<T> | (() => PromiseLike<T>);

/**
 * Resolves when `work` settles, the clock passes `ms`, or `signal` aborts.
 *
 * Android WebView does not honor the Geolocation timeout, and a single long
 * `setTimeout` scheduled while a high-accuracy watch is outstanding often
 * never runs. The clock is armed with a short interval and a one-shot timer
 * before a thunk starts, so the wait cannot outlive `ms`.
 */
export function withDeadline<T>(
  work: DeadlineWork<T>,
  ms: number,
  signal?: AbortSignal,
): Promise<DeadlineResult<T>> {
  return new Promise(resolve => {
    let settled = false;
    let interval: ReturnType<typeof globalThis.setInterval> | undefined;
    let backup: ReturnType<typeof globalThis.setTimeout> | undefined;
    const finish = (value: DeadlineResult<T>) => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      clearTimeout(backup);
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => finish({ cancelled: true });
    if (signal?.aborted) {
      finish({ cancelled: true });
      return;
    }
    signal?.addEventListener('abort', onAbort);
    const started = Date.now();
    interval = globalThis.setInterval(() => {
      if (Date.now() - started >= ms) finish({ timedOut: true });
    }, 200);
    backup = globalThis.setTimeout(() => finish({ timedOut: true }), ms);
    if (settled) return;
    let job: PromiseLike<T>;
    try {
      job = typeof work === 'function' ? work() : work;
    } catch {
      finish({ timedOut: true });
      return;
    }
    if (settled) return;
    job.then(
      value => finish(value),
      () => finish({ timedOut: true }),
    );
  });
}

function isBetter(next: StartFix, current: StartFix): boolean {
  if (next.accuracyM == null) return false;
  if (current.accuracyM == null) return true;
  return next.accuracyM < current.accuracyM;
}

/**
 * Watches until a fix is at least as tight as `accuracyGoalM`, or the timeout
 * returns the best fix seen. Permission denial with no fix fails immediately.
 */
export function watchForStartFix(
  watch: GeoWatch,
  options: {
    timeoutMs: number;
    accuracyGoalM: number;
    schedule: (run: () => void, delayMs: number) => () => void;
  },
): Promise<LocateResult> {
  return new Promise(resolve => {
    let settled = false;
    let best: StartFix | null = null;
    let stop = () => {};
    let cancelTimer = () => {};

    const finish = (result: LocateResult) => {
      if (settled) return;
      settled = true;
      cancelTimer();
      stop();
      resolve(result);
    };

    cancelTimer = options.schedule(() => {
      if (best) finish({ ok: true, fix: best, quality: 'best' });
      else finish({ ok: false, reason: 'timeout' });
    }, options.timeoutMs);

    stop = watch(
      fix => {
        if (fix.accuracyM != null && fix.accuracyM <= options.accuracyGoalM) {
          finish({ ok: true, fix, quality: 'accurate' });
          return;
        }
        if (!best || isBetter(fix, best)) best = fix;
      },
      error => {
        if (best) finish({ ok: true, fix: best, quality: 'best' });
        else finish({ ok: false, reason: error });
      },
    );
  });
}

export interface StartSources {
  /** Native fused/CoreLocation request. Omitted in the plain browser. */
  nativePosition?: (options: { enableHighAccuracy: boolean; maximumAge: number; timeoutMs: number }) => Promise<NativePositionResult>;
  watch: GeoWatch;
  /** enableHighAccuracy false and maximumAge 60000. */
  coarsePosition: () => Promise<StartFix>;
}

/**
 * High-accuracy first. If that source does not settle, use a last-known
 * coarse fix and the first watch update. A fatal status (permission, location
 * services, missing plugin) returns immediately.
 */
export async function acquireStartFix(
  sources: StartSources,
  options: {
    accuracyGoalM: number;
    highAccuracyMs: number;
    coarseMs: number;
    signal?: AbortSignal;
    withDeadline: <T>(work: DeadlineWork<T>, ms: number, signal?: AbortSignal) => Promise<DeadlineResult<T>>;
  },
): Promise<LocateResult> {
  if (options.signal?.aborted) return { ok: false, reason: 'cancelled' };

  let best: StartFix | null = null;
  let watchFailure: LocateFailure | null = null;
  let stop = () => {};

  const consider = (fix: StartFix) => {
    if (!best || isBetter(fix, best)) best = fix;
  };
  const goodEnough = (fix: StartFix) => fix.accuracyM != null && fix.accuracyM <= options.accuracyGoalM;
  const fromFix = (fix: StartFix): LocateResult => (
    { ok: true, fix, quality: goodEnough(fix) ? 'accurate' : 'best' }
  );
  const fatal = (reason: LocateFailure) => reason === 'denied' || reason === 'services-off';

  try {
    const raced = await options.withDeadline(() => {
      const watchArrived = new Promise<StartFix | null>(resolve => {
        stop = sources.watch(
          fix => {
            consider(fix);
            resolve(fix);
          },
          error => {
            watchFailure = error;
            resolve(null);
          },
        );
      });
      if (best) return Promise.resolve({ source: 'watch' as const, fix: best });
      const highWork = sources.nativePosition
        ? sources.nativePosition({ enableHighAccuracy: true, maximumAge: 0, timeoutMs: options.highAccuracyMs })
        : new Promise<NativePositionResult>(() => {});
      return Promise.race([
        highWork.then(result => ({ source: 'native' as const, result })),
        watchArrived.then(fix => ({ source: 'watch' as const, fix })),
      ]);
    }, options.highAccuracyMs, options.signal);
    if (isCancelled(raced)) return { ok: false, reason: 'cancelled' };
    if (!isTimedOut(raced)) {
      if (raced.source === 'watch' && raced.fix) return fromFix(raced.fix);
      if (raced.source === 'native') {
        if (raced.result.ok === false && fatal(raced.result.reason)) return raced.result;
        if (raced.result.ok === true) {
          consider(raced.result.fix);
          return fromFix(raced.result.fix);
        }
      }
    }

    if (best) return fromFix(best);
    if (watchFailure && fatal(watchFailure)) return { ok: false, reason: watchFailure };

    const coarse = await options.withDeadline(() => Promise.resolve(sources.coarsePosition()).then(
      fix => ({ ok: true as const, fix }),
      (err: unknown) => ({ ok: false as const, reason: nativeFailureReason(err) }),
    ), options.coarseMs, options.signal);
    if (isCancelled(coarse)) return { ok: false, reason: 'cancelled' };
    if (!isTimedOut(coarse)) {
      if (coarse.ok === false && fatal(coarse.reason)) return { ok: false, reason: coarse.reason };
      if (coarse.ok === true) consider(coarse.fix);
    }

    if (best) return fromFix(best);
    if (watchFailure === 'unavailable') return { ok: false, reason: 'unavailable' };
    return { ok: false, reason: 'timeout' };
  } finally {
    stop();
  }
}

export function nativeFailureReason(err: unknown): Exclude<LocateFailure, 'cancelled'> {
  const detail = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (detail.includes('services-off') || detail.includes('services off') || detail.includes('location disabled')) {
    return 'services-off';
  }
  if (detail.includes('plugin-missing') || detail.includes('not implemented')) return 'plugin-missing';
  if (detail.includes('denied') || detail.includes('permission')) return 'denied';
  if (detail.includes('unavailable')) return 'unavailable';
  return 'timeout';
}

export function browserStartWatch(): GeoWatch {
  return (onFix, onError) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onError('unavailable');
      return () => {};
    }
    const id = navigator.geolocation.watchPosition(
      position => onFix({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        speedMps: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        at: Date.now(),
      }),
      error => {
        if (error.code === error.PERMISSION_DENIED) onError('denied');
        else if (error.code === error.TIMEOUT) onError('timeout');
        else onError('unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: START_FIX_TIMEOUT_MS },
    );
    return () => navigator.geolocation.clearWatch(id);
  };
}

export function gpsTimeoutMessage(): string {
  return 'GPS timed out. High accuracy and the last-known position both failed. Turn location on, step into open sky, and tap Start again.';
}

export function locationServicesOffMessage(): string {
  return 'Location services are turned off. Open Settings, Location, and turn location on. Then tap Start again.';
}

export function pluginMissingMessage(): string {
  return 'The phone location plugin is not available. Force-close ITDG Dispatch, reopen it, and tap Start again. If that fails, reinstall the debug APK.';
}

export function locationRequestCancelledMessage(): string {
  return 'Location request cancelled.';
}

export function permissionCheckTimeoutMessage(): string {
  return 'Location permission check timed out. If a permission dialog is open, answer it, then tap Start again.';
}

export function locateFailureMessage(reason: LocateFailure): string {
  switch (reason) {
    case 'denied':
      return permissionDeniedMessage();
    case 'timeout':
      return gpsTimeoutMessage();
    case 'services-off':
      return locationServicesOffMessage();
    case 'plugin-missing':
      return pluginMissingMessage();
    case 'cancelled':
      return locationRequestCancelledMessage();
    case 'unavailable':
      return locationUnavailableMessage();
    default: {
      const unreachable: never = reason;
      return otherStartErrorMessage(String(unreachable));
    }
  }
}

export function permissionDeniedMessage(): string {
  return 'Location permission is denied, so the shift did not start. On this Android phone open Settings, Apps, ITDG Dispatch, Permissions, Location, and choose Allow only while using the app. Then tap Start again.';
}

export function locationUnavailableMessage(): string {
  return 'This device did not return a location. Turn location on in system settings, then tap Start again.';
}

export function consentCancelledMessage(): string {
  return 'Start cancelled. Location is not recorded until you accept and clock in.';
}

export function notAtShopMessage(distanceM: number, accuracyM: number | null, radiusM: number): string {
  const distance = Math.round(distanceM);
  const accuracy = accuracyM != null && Number.isFinite(accuracyM)
    ? `±${Math.round(accuracyM)} m accuracy`
    : 'accuracy unknown';
  return `You're ${distance} m from the shop (${accuracy}). The shop fence is ${Math.round(radiusM)} m. Move closer and tap Start again.`;
}

export function otherStartErrorMessage(error: string): string {
  switch (error) {
    case 'no-shop':
      return 'Set the shop location before starting. Start happens at the shop.';
    case 'already-started':
      return 'A shift is already running. Clock out before starting another.';
    case 'not-started':
      return 'No shift is running to clock out.';
    default:
      return `Could not start the shift (${error}). Try again. If it keeps happening, force-close the app and reopen it.`;
  }
}

export function shopReach(distanceM: number, radiusM: number, accuracyM: number | null | undefined): boolean {
  return countsAsInside(distanceM, radiusM, accuracyM);
}
