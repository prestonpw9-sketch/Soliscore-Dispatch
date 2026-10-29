import { WebPlugin } from '@capacitor/core';

/** Browser fallback is implemented in the app. This stub keeps the plugin callable. */
export class JobGeofenceWeb extends WebPlugin {
  async checkAccess() {
    return { location: 'prompt', notifications: 'prompt' };
  }

  async requestAccess() {
    return { location: 'denied', notifications: 'denied' };
  }

  async sync() {
    return { monitoring: 0, dropped: 0, active: false };
  }

  async stop() {}

  async consumePendingArrival() {
    return { jobId: null, jobName: null, open: false };
  }

  async startShiftTracking() {}

  async stopShiftTracking() {}

  async drainSamples() {
    return { samples: [] };
  }

  async getBattery() {
    return { percent: null };
  }
}
