import { countsAsInside } from './machine.ts';

export const START_FIX_TIMEOUT_MS = 30_000;

export interface StartFix {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedMps: number | null;
  at: number;
}

export type LocateFailure = 'denied' | 'timeout' | 'unavailable';

export type LocateResult =
  | { ok: true; fix: StartFix; quality: 'accurate' | 'best' }
  | { ok: false; reason: LocateFailure };

export interface GeoWatch {
  (
    onFix: (fix: StartFix) => void,
    onError: (error: LocateFailure) => void,
  ): () => void;
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
  return 'GPS timed out after 30 seconds and no fix arrived. Step into open sky or turn location on, then tap Start again.';
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
