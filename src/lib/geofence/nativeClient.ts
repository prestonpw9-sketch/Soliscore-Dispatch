import type { JobGeofencePlugin } from 'capacitor-job-geofence';

type NativeShell = {
  isNativePlatform?: () => boolean;
};

function nativeShell(): NativeShell | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { Capacitor?: NativeShell }).Capacitor;
}

/** True only inside the Capacitor Android or iOS shell. */
export function isNativeDispatchApp(): boolean {
  return nativeShell()?.isNativePlatform?.() === true;
}

/**
 * Loads the local geofence plugin. The web bundle keeps this in a separate
 * chunk so the Vercel app does not start Capacitor unless the phone shell
 * injected `window.Capacitor`.
 */
export async function loadJobGeofence(): Promise<JobGeofencePlugin | null> {
  if (!isNativeDispatchApp()) return null;
  const mod = await import('capacitor-job-geofence');
  return mod.JobGeofence;
}
