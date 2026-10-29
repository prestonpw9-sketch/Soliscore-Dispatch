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

export interface JobGeofencePlugin {
  checkAccess(): Promise<AccessStatus>;
  requestAccess(): Promise<AccessStatus>;
  sync(options: { sites: JobSiteSpec[]; workHours: WorkHoursSpec }): Promise<SyncResult>;
  stop(): Promise<void>;
  consumePendingArrival(): Promise<PendingArrival>;
  addListener(
    eventName: 'arrival',
    listenerFunc: (event: ArrivalEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const JobGeofence: JobGeofencePlugin;
