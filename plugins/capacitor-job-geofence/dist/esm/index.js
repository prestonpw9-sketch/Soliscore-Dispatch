import { registerPlugin } from '@capacitor/core';

const JobGeofence = registerPlugin('JobGeofence', {
  web: () => import('./web.js').then(module => new module.JobGeofenceWeb()),
});

export { JobGeofence };
