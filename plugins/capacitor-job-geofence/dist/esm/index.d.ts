import type { PluginListenerHandle } from '@capacitor/core';

export interface JobSiteSpec {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface WorkHoursSpec {
  timeZone: string;
  startHour: number;
  endHour: number;
  weekdaysOnly: boolean;
}

export interface AccessStatus {
  location: 'granted' | 'denied' | 'prompt';
  notifications: 'granted' | 'denied' | 'prompt';
}

export interface SyncResult {
  monitoring: number;
  dropped: number;
  active: boolean;
}

export interface PendingArrival {
  jobId: string | null;
  jobName: string | null;
  /** True when the crew member tapped the arrival notification. */
  open: boolean;
}

export interface ArrivalEvent {
  jobId: string;
  jobName: string;
  open: boolean;
}

export interface ShiftSample {
  at: number;
  latitude: number;
  longitude: number;
  speedMps: number | null;
  batteryPercent: number | null;
}

export interface JobGeofencePlugin {
  checkAccess(): Promise<AccessStatus>;
  requestAccess(): Promise<AccessStatus>;
  sync(options: { sites: JobSiteSpec[]; workHours: WorkHoursSpec }): Promise<SyncResult>;
  stop(): Promise<void>;
  consumePendingArrival(): Promise<PendingArrival>;
  startShiftTracking(options: { shop: JobSiteSpec; sites: JobSiteSpec[] }): Promise<void>;
  stopShiftTracking(): Promise<void>;
  drainSamples(): Promise<{ samples: ShiftSample[] }>;
  getBattery(): Promise<{ percent: number | null }>;
  addListener(
    eventName: 'arrival',
    listenerFunc: (event: ArrivalEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'sample',
    listenerFunc: (sample: ShiftSample) => void,
  ): Promise<PluginListenerHandle>;
}

export const JobGeofence: JobGeofencePlugin;
