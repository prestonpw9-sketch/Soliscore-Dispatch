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

export interface ClockInReminderSpec {
  hour: number;
  minute: number;
  /** 1 = Monday … 7 = Sunday. */
  weekdays: number[];
  /** Android Clock alarm label. */
  label: string;
  /** iOS notification title and body. */
  title: string;
  body: string;
}

export interface JobGeofencePlugin {
  /**
   * Android: adds a repeating alarm to the phone's Clock app (ACTION_SET_ALARM).
   * iOS: schedules repeating local notifications (apps can't add Clock alarms).
   * Optional: builds before the reminder shipped don't have it.
   */
  setClockInReminder?(options: ClockInReminderSpec): Promise<{ method: 'clock-app' | 'notification' }>;
  /** iOS removes the notifications. Android can't delete a Clock alarm: removed is false. */
  cancelClockInReminder?(options: { label: string }): Promise<{ removed: boolean }>;
  /** iOS: drop today's notification if it's still ahead. Android: no-op. */
  skipClockInReminderToday?(): Promise<{ skipped: boolean }>;
  /** Android: open the Clock app's alarm list. */
  openClockAlarms?(): Promise<void>;
  checkAccess(): Promise<AccessStatus>;
  requestAccess(): Promise<AccessStatus>;
  /** Asks for background location after Start. Must not be awaited on the start path. */
  requestBackgroundAccess(): Promise<AccessStatus>;
  sync(options: { sites: JobSiteSpec[]; workHours: WorkHoursSpec }): Promise<SyncResult>;
  stop(): Promise<void>;
  consumePendingArrival(): Promise<PendingArrival>;
  startShiftTracking(options: { shop: JobSiteSpec; sites: JobSiteSpec[] }): Promise<void>;
  stopShiftTracking(): Promise<void>;
  drainSamples(): Promise<{ samples: ShiftSample[] }>;
  getBattery(): Promise<{ percent: number | null }>;
  getCurrentPosition(options: {
    enableHighAccuracy: boolean;
    maximumAge: number;
    timeout: number;
  }): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    time: number;
  }>;
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
