/**
 * Payroll day map helpers: stop numbering, job pin selection, shops, bounds.
 * Run: npm run test:daymap
 */
import assert from 'node:assert/strict';
import { buildPlaces, nearestNamed, shortClock, spanKm } from '../src/lib/payroll/dayMap.ts';
import { boundsOf, buildJobPins, buildShops, buildStops, type DayMapSegmentInput } from '../src/lib/payroll/dayMap.ts';

const segs: DayMapSegmentInput[] = [
  { id: 'b', kind: 'driving', job_id: null, job_name: null, started_at: '2026-10-29T19:50:00Z', ended_at: '2026-10-29T20:20:00Z',
    start_latitude: 32.22, start_longitude: -110.9, end_latitude: '33.41', end_longitude: '-111.8' },
  { id: 'a', kind: 'shop', job_id: null, job_name: null, started_at: '2026-10-29T18:14:00Z', ended_at: '2026-10-29T19:50:00Z',
    start_latitude: 32.22, start_longitude: -110.9, end_latitude: 32.22001, end_longitude: -110.90001 },
  { id: 'c', kind: 'job', job_id: 7, job_name: 'DCS', started_at: '2026-10-29T20:20:00Z', ended_at: null,
    start_latitude: 33.41, start_longitude: -111.8, end_latitude: null, end_longitude: null },
  { id: 'd', kind: 'lunch', job_id: null, job_name: null, started_at: '2026-10-29T18:00:00Z', ended_at: '2026-10-29T18:30:00Z' },
];

const stops = buildStops(segs);
assert.deepEqual(stops.map(s => `${s.number}${s.segmentId}${s.edge[0]}`), ['1as', '2bs', '3be', '4cs'], 'time order; duplicate end point dropped; no-coord lunch skipped');
assert.equal(stops[1].minutes, 30);
assert.equal(stops[3].minutes, null, 'open segment has no duration');
assert.equal(stops[2].lat, 33.41, 'string coordinates are parsed');

const pins = buildJobPins([
  { id: '7', customerName: 'DCS', latitude: 33.41, longitude: -111.8, date: '2026-10-01', endDate: '2026-10-02' },
  { id: '8', customerName: 'Sched', latitude: 32.1, longitude: -110.8, date: '2026-10-28', endDate: '2026-10-30', geofenceRadiusM: 500 },
  { id: '9', customerName: 'Other', latitude: 32.1, longitude: -110.8, date: '2026-11-05' },
  { id: '10', customerName: 'NoPin', latitude: null, longitude: null, date: '2026-10-29' },
], segs, '2026-10-29');
assert.deepEqual(pins.map(p => [p.id, p.visited, p.scheduled]), [['7', true, false], ['8', false, true]]);
assert.equal(pins[0].radiusM, 90, 'default radius');
assert.equal(pins[1].radiusM, 200, 'radius clamped');

const shops = buildShops([
  { id: 's', name: 'Shop', latitude: '32.2', longitude: '-110.9', radius_m: 120 },
  { id: 'x', name: 'Old', latitude: 32, longitude: -110, active: false },
  { id: 'z', name: 'Zero', latitude: 0, longitude: 0 },
]);
assert.deepEqual(shops.map(s => s.id), ['s']);

assert.equal(boundsOf([]), null);
assert.deepEqual(boundsOf([{ lat: 1, lng: 2 }, { lat: 3, lng: -4 }]), [[1, -4], [3, 2]]);

console.log('day-map checks passed');

// ── Readable places: Preston's Oct 29 pattern ─────────────────────────────

const oct29: DayMapSegmentInput[] = [
  { id: 'shop', kind: 'shop', job_id: null, job_name: 'Shop', started_at: '2026-10-29T18:14:00Z', ended_at: '2026-10-29T19:50:00Z',
    start_latitude: 32.1734, start_longitude: -110.9216, end_latitude: 32.17342, end_longitude: -110.92158 },
  { id: 'drive', kind: 'driving', job_id: null, job_name: null, started_at: '2026-10-29T19:50:00Z', ended_at: '2026-10-30T00:00:00Z',
    start_latitude: 32.17341, start_longitude: -110.92161, end_latitude: 33.4227, end_longitude: -111.6579 },
];
const oShops = buildShops([{ id: 's', name: 'ITDG Shop', latitude: 32.1734, longitude: -110.9216, radius_m: 120 }]);
const oPins = buildJobPins([{ id: '99', customerName: 'DCS', latitude: 33.4235, longitude: -111.6570, date: '2026-10-29' }], oct29, '2026-10-29');
const places = buildPlaces(buildStops(oct29), oPins, oShops);
assert.deepEqual(places.map(p => p.label), ['ITDG Shop 11:14a', 'Ended near DCS 5:00p'], 'shop + driving start merge; end named near DCS');
assert.equal(places[0].minutes, 96, 'time at shop 11:14–12:50');
assert.equal(places[1].travelMinutes, 250, 'travel 12:50–5:00');
assert.equal(shortClock('2026-10-29T20:55:00Z'), '1:55p');
assert.equal(nearestNamed(33.4227, -111.6579, oPins, oShops)?.name, 'DCS');
assert.equal(nearestNamed(33.44, -111.6579, oPins, oShops), null, '~2 km away is not "near"');
assert.ok(spanKm(places) > 100, 'Tucson to Mesa is far apart');

// Unpinned stop with no nearby job keeps a plain label.
const lone = buildPlaces(buildStops([oct29[1]]), [], []);
assert.deepEqual(lone.map(p => p.place), ['Started driving', 'Stopped driving']);

// On-site segment uses the job name.
const onsite = buildPlaces(buildStops([{ id: 'j', kind: 'job', job_id: 99, job_name: 'DCS', started_at: '2026-10-29T20:55:00Z', ended_at: '2026-10-29T23:00:00Z',
  start_latitude: 33.4235, start_longitude: -111.657, end_latitude: 33.4236, end_longitude: -111.6571 }]), oPins, oShops);
assert.equal(onsite[0].label, 'DCS 1:55p');
assert.equal(onsite[0].minutes, 125);

console.log('day-map readable-place checks passed');
