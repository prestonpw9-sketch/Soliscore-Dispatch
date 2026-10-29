/**
 * Pure checks for job-site arrival hours, distance, and the optional geocoder.
 * Does not call Nominatim or Supabase.
 *
 * Run: npm run test:geofence
 */
import assert from 'node:assert/strict';
import { distanceMeters } from '../src/lib/geofence/distance.ts';
import {
  arrivalNotificationBody,
  jobSitesForArrival,
  nearestArrival,
} from '../src/lib/geofence/sites.ts';
import {
  DEFAULT_WORK_HOURS,
  isWithinWorkHours,
  nextWorkHoursBoundary,
  sanitizeWorkHours,
} from '../src/lib/geofence/workHours.ts';
import { geocodeAddress, jobGeofenceUpdate } from '../src/lib/geocodeAddress.ts';
import type { Job } from '../src/lib/data.ts';

const phoenix = DEFAULT_WORK_HOURS;

function at(iso: string): Date {
  return new Date(iso);
}

assert.equal(isWithinWorkHours(at('2026-10-28T15:00:00Z'), phoenix), true);
assert.equal(isWithinWorkHours(at('2026-10-28T13:00:00Z'), phoenix), true);
assert.equal(isWithinWorkHours(at('2026-10-28T12:59:00Z'), phoenix), false);
assert.equal(isWithinWorkHours(at('2026-10-28T23:00:00Z'), phoenix), false);
assert.equal(isWithinWorkHours(at('2026-10-31T15:00:00Z'), phoenix), false);
assert.equal(
  isWithinWorkHours(at('2026-10-31T15:00:00Z'), { ...phoenix, weekdaysOnly: false }),
  true,
);

const stop = nextWorkHoursBoundary(at('2026-10-28T15:00:00Z'), phoenix);
assert.equal(stop.action, 'stop');
assert.equal(stop.at.toISOString(), '2026-10-28T23:00:00.000Z');

const morning = nextWorkHoursBoundary(at('2026-10-28T12:59:00Z'), phoenix);
assert.equal(morning.action, 'start');
assert.equal(morning.at.toISOString(), '2026-10-28T13:00:00.000Z');

const friday = nextWorkHoursBoundary(at('2026-10-31T00:00:00Z'), phoenix);
assert.equal(friday.action, 'start');
assert.equal(friday.at.toISOString(), '2026-11-02T13:00:00.000Z');

assert.deepEqual(sanitizeWorkHours({ startHour: 7, endHour: 15, weekdaysOnly: false }), {
  timeZone: 'America/Phoenix',
  startHour: 7,
  endHour: 15,
  weekdaysOnly: false,
});
assert.equal(sanitizeWorkHours({ startHour: 18, endHour: 6 }).startHour, 6);

assert.equal(distanceMeters(32.22, -110.97, 32.22, -110.97), 0);
const north = distanceMeters(32.22, -110.97, 32.221, -110.97);
assert.ok(north > 100 && north < 120);
assert.ok(distanceMeters(32.22, -110.97, 32.2205, -110.97) < 90);

assert.equal(arrivalNotificationBody(' Congress Site '), "You're at Congress Site, update your time card?");
assert.equal(arrivalNotificationBody('   '), "You're at this job, update your time card?");

const job = {
  id: 'job-1',
  customerName: 'Congress Site',
  status: 'scheduled',
  date: '2026-10-01',
  endDate: '2026-10-31',
  latitude: 32.22,
  longitude: -110.97,
  geofenceRadiusM: null,
} as Job;

const sites = jobSitesForArrival([
  job,
  { ...job, id: 'done', status: 'completed' },
  { ...job, id: 'bare', latitude: null, longitude: null },
  { ...job, id: 'later', date: '2026-11-01', endDate: '2026-11-02' },
], '2026-10-28');
assert.deepEqual(sites.map(site => site.id), ['job-1']);
assert.equal(sites[0].radiusMeters, 90);
assert.equal(nearestArrival(32.22, -110.97, sites)?.id, 'job-1');
assert.equal(nearestArrival(0, 0, sites), null);

const geocoded = await geocodeAddress('100 E Congress St, Tucson, AZ', {
  fetchImpl: async () => new Response(JSON.stringify([
    { lat: '32.2217', lon: '-110.9265', display_name: 'Congress Street' },
  ]), { status: 200 }),
});
assert.equal(geocoded.ok, true);
if (geocoded.ok) {
  assert.deepEqual(jobGeofenceUpdate(geocoded.hit), {
    latitude: 32.2217,
    longitude: -110.9265,
    geofence_radius_m: 90,
  });
}

const empty = await geocodeAddress('   ');
assert.deepEqual(empty, { ok: false, message: 'Address is empty.' });

const missing = await geocodeAddress('nowhere', {
  fetchImpl: async () => new Response('[]', { status: 200 }),
});
assert.equal(missing.ok, false);

console.log('geofence checks passed');
