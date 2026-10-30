import type { JobGeofencePlugin } from 'capacitor-job-geofence';

export interface BridgeGeolocation {
  getCurrentPosition?: (options: {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
  }) => Promise<{
    latitude?: number;
    longitude?: number;
    accuracy?: number | null;
    speed?: number | null;
    coords?: {
      latitude?: number;
      longitude?: number;
      accuracy?: number | null;
      speed?: number | null;
    };
    timestamp?: number;
  }>;
  requestPermissions?: () => Promise<{ location?: string }>;
}

export interface BridgeShell {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: {
    JobGeofence?: JobGeofencePlugin;
    Geolocation?: BridgeGeolocation;
  };
}

function nativeShell(): BridgeShell | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { Capacitor?: BridgeShell }).Capacitor;
}

/** True only inside the Capacitor Android or iOS shell. */
export function isNativeDispatchApp(): boolean {
  return nativeShell()?.isNativePlatform?.() === true;
}

function bridgePlugin<T>(cap: BridgeShell | null | undefined, name: 'JobGeofence' | 'Geolocation', plugin: T | undefined): T | null {
  if (!plugin) return null;
  if (cap?.isPluginAvailable && !cap.isPluginAvailable(name)) return null;
  return plugin;
}

/**
 * The native shell injects `Capacitor.Plugins.JobGeofence` from
 * `capacitor.plugins.json` before the page script runs. Use that object.
 * A dynamic import of `capacitor-job-geofence` bundles a second
 * `@capacitor/core`, and `registerPlugin` replaces the bridge object.
 * On the phone that proxy reports the plugin missing.
 */
export function jobGeofenceFromBridge(cap: BridgeShell | null | undefined): JobGeofencePlugin | null {
  return bridgePlugin(cap, 'JobGeofence', cap?.Plugins?.JobGeofence);
}

/** Official Capacitor Geolocation, when the Android project registered it. */
export function geolocationFromBridge(cap: BridgeShell | null | undefined): BridgeGeolocation | null {
  const plugin = bridgePlugin(cap, 'Geolocation', cap?.Plugins?.Geolocation);
  if (!plugin?.getCurrentPosition) return null;
  return plugin;
}

export async function loadJobGeofence(): Promise<JobGeofencePlugin | null> {
  if (!isNativeDispatchApp()) return null;
  return jobGeofenceFromBridge(nativeShell());
}
