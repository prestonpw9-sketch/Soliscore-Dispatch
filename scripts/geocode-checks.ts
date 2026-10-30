/**
 * Job-address geocoder: Census first, Nominatim fallback, Arizona bias, and
 * the never-overwrite rule. Uses a fake fetch and an in-memory job store.
 * Does not call the network or Supabase.
 *
 * Run: npm run test:geocode
 */
import assert from 'node:assert/strict';
import {
  geocodeJobAddress,
  inArizona,
  isPlaceholderAddress,
  namesOtherState,
  parseLatLng,
  withArizonaBias,
} from '../supabase/functions/_shared/geocode.ts';
import { runJobGeocode, scheduleJobGeocode } from '../supabase/functions/_shared/geocodeAfterInsert.ts';
import {
  geocodeJobById,
  type JobGeoPatch,
  type JobGeoRow,
  type JobGeocodeStore,
} from '../supabase/functions/_shared/geocodeJob.ts';

// ── Address helpers ────────────────────────────────────────────────────────

assert.equal(isPlaceholderAddress(''), true);
assert.equal(isPlaceholderAddress('Address pending'), true);
assert.equal(isPlaceholderAddress('Tucson, AZ'), true, 'app default when no address was typed');
assert.equal(isPlaceholderAddress('Oro Valley Arizona'), true);
assert.equal(isPlaceholderAddress('100 E Congress St, Tucson'), false);
assert.equal(isPlaceholderAddress('Lot 12 Saguaro Ranch'), false);

assert.equal(withArizonaBias('100 E Congress St, Tucson'), '100 E Congress St, Tucson, AZ');
assert.equal(withArizonaBias('100 E Congress St, Tucson, AZ 85701'), '100 E Congress St, Tucson, AZ 85701');
assert.equal(withArizonaBias('100 E Congress St 85701'), '100 E Congress St 85701');
assert.equal(withArizonaBias('1 Main St, Las Vegas, NV'), '1 Main St, Las Vegas, NV');

assert.equal(namesOtherState('1 Main St, Las Vegas, NV 89101'), true);
assert.equal(namesOtherState('1 Main St, Albuquerque, NM'), true);
assert.equal(namesOtherState('1 Main St, Tucson, AZ 85701'), false);
assert.equal(namesOtherState('1 Main St, Tucson'), false);

assert.equal(inArizona(32.2226, -110.9747), true);
assert.equal(inArizona(36.1699, -115.1398), false, 'Las Vegas');

assert.deepEqual(parseLatLng('32.2226, -110.9747'), { latitude: 32.2226, longitude: -110.9747 });
assert.deepEqual(parseLatLng('(32.2226 -110.9747)'), { latitude: 32.2226, longitude: -110.9747 });
assert.equal(parseLatLng('132.2, -110'), null);
assert.equal(parseLatLng('Tucson'), null);

// ── Fake geocoders ─────────────────────────────────────────────────────────

interface Call {
  url: URL;
  userAgent: string | null;
}

function fakeFetch(handlers: {
  census?: (url: URL) => unknown;
  nominatim?: (url: URL) => unknown;
}): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({ url, userAgent: headers.get('User-Agent') });
    const handler = url.hostname.includes('census') ? handlers.census : handlers.nominatim;
    if (!handler) return new Response('[]', { status: 500 });
    const body = handler(url);
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const censusHit = (lat: number, lng: number, label = '100 E CONGRESS ST, TUCSON, AZ, 85701') => ({
  result: { addressMatches: [{ matchedAddress: label, coordinates: { x: lng, y: lat } }] },
});
const censusNone = { result: { addressMatches: [] } };

{
  const { fetchImpl, calls } = fakeFetch({ census: () => censusHit(32.2217, -110.9692) });
  const result = await geocodeJobAddress('100 E Congress St, Tucson', { fetchImpl, userAgent: 'test-agent' });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.source, 'census');
    assert.equal(result.latitude, 32.2217);
    assert.equal(result.longitude, -110.9692);
    assert.match(result.matchedAddress, /CONGRESS/);
  }
  assert.equal(calls.length, 1, 'Nominatim not called when Census matches');
  assert.equal(calls[0].url.searchParams.get('address'), '100 E Congress St, Tucson, AZ');
  assert.equal(calls[0].url.searchParams.get('benchmark'), 'Public_AR_Current');
}

{
  const { fetchImpl, calls } = fakeFetch({
    census: () => censusNone,
    nominatim: () => [{ lat: '32.3', lon: '-111.0', display_name: 'Marana, Pima County, Arizona' }],
  });
  const result = await geocodeJobAddress('12 Saguaro Ranch Rd', { fetchImpl, userAgent: 'test-agent' });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') assert.equal(result.source, 'nominatim');
  const osm = calls[1].url;
  assert.equal(osm.hostname, 'nominatim.openstreetmap.org');
  assert.equal(osm.searchParams.get('countrycodes'), 'us');
  assert.ok(osm.searchParams.get('viewbox'), 'Arizona viewbox bias');
  assert.equal(osm.searchParams.get('bounded'), '0');
  assert.equal(calls[1].userAgent, 'test-agent', 'Nominatim gets a real User-Agent');
}

{
  // Census and Nominatim both match outside Arizona for an address with no state.
  const { fetchImpl } = fakeFetch({
    census: () => censusHit(36.17, -115.14, '100 MAIN ST, LAS VEGAS, NV'),
    nominatim: () => [{ lat: '36.17', lon: '-115.14', display_name: 'Las Vegas' }],
  });
  const result = await geocodeJobAddress('100 Main St', { fetchImpl });
  assert.equal(result.status, 'failed', 'outside Arizona is rejected');
}

{
  // Nominatim prefers the Arizona candidate when several come back.
  const { fetchImpl } = fakeFetch({
    census: () => censusNone,
    nominatim: () => [
      { lat: '36.17', lon: '-115.14', display_name: 'Las Vegas' },
      { lat: '32.25', lon: '-110.9', display_name: 'Tucson' },
    ],
  });
  const result = await geocodeJobAddress('100 Main St', { fetchImpl });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') assert.equal(result.latitude, 32.25);
}

{
  const { fetchImpl } = fakeFetch({ census: () => censusHit(36.17, -115.14, 'LAS VEGAS, NV') });
  const result = await geocodeJobAddress('100 Main St, Las Vegas, NV', { fetchImpl });
  assert.equal(result.status, 'ok', 'an address that names another state may resolve there');
}

{
  const { fetchImpl } = fakeFetch({
    census: () => new Error('network down'),
    nominatim: () => new Error('network down'),
  });
  const result = await geocodeJobAddress('100 E Congress St', { fetchImpl });
  assert.equal(result.status, 'failed', 'network errors become failed, never a throw');
}

{
  const { fetchImpl, calls } = fakeFetch({});
  const result = await geocodeJobAddress('Address pending', { fetchImpl });
  assert.equal(result.status, 'no_address');
  assert.equal(calls.length, 0, 'placeholder is not sent to a geocoder');
}

// ── Never overwrite existing coordinates ───────────────────────────────────

function memoryStore(rows: JobGeoRow[]) {
  const table = new Map(rows.map(row => [row.id, { ...row } as JobGeoRow & Partial<JobGeoPatch>]));
  const updates: Array<{ id: string; patch: JobGeoPatch; guard: string }> = [];
  const store: JobGeocodeStore = {
    async load(id) {
      const row = table.get(id);
      return row ? { ...row } : null;
    },
    async update(id, patch, guard) {
      updates.push({ id, patch, guard });
      const row = table.get(id);
      if (!row) return { count: 0 };
      const matches = guard === 'stale' ? (row.geocode_status as string | null) === 'stale' : row.latitude == null;
      if (!matches) return { count: 0 };
      Object.assign(row, patch);
      return { count: 1 };
    },
  };
  return { store, table, updates };
}

const okLookup = async () => ({
  status: 'ok' as const,
  latitude: 32.1,
  longitude: -110.9,
  matchedAddress: 'MATCH',
  source: 'census' as const,
});
const failLookup = async () => ({ status: 'failed' as const, message: 'no match' });

{
  const { store, table, updates } = memoryStore([
    { id: '1', location: '1 A St', latitude: 32.5, longitude: -111.5, geocode_status: 'manual' },
  ]);
  const outcome = await geocodeJobById(store, '1', { geocode: okLookup });
  assert.equal(outcome.result, 'already_pinned');
  assert.equal(updates.length, 0, 'pinned job is not written');
  assert.equal(table.get('1')?.latitude, 32.5);
}

{
  const { store, table, updates } = memoryStore([
    { id: '2', location: '2 B St', latitude: null, longitude: null, geocode_status: null },
  ]);
  const outcome = await geocodeJobById(store, '2', { geocode: okLookup });
  assert.equal(outcome.result, 'pinned');
  assert.equal(updates[0].guard, 'unpinned');
  assert.equal(table.get('2')?.latitude, 32.1);
  assert.equal(table.get('2')?.geocode_status, 'ok');
  assert.equal(table.get('2')?.geocoded_address, 'MATCH');
}

{
  // Someone pinned it by hand while the lookup ran: the guarded write matches nothing.
  const { store, table } = memoryStore([
    { id: '3', location: '3 C St', latitude: null, longitude: null, geocode_status: 'pending' },
  ]);
  const racing: JobGeocodeStore = {
    load: store.load,
    async update(id, patch, guard) {
      Object.assign(table.get(id)!, { latitude: 31.9, longitude: -110.8, geocode_status: 'manual' });
      return store.update(id, patch, guard);
    },
  };
  const outcome = await geocodeJobById(racing, '3', { geocode: okLookup });
  assert.equal(outcome.result, 'already_pinned');
  assert.equal(table.get('3')?.latitude, 31.9, 'hand pin survives');
}

{
  const { store, table, updates } = memoryStore([
    { id: '4', location: '4 D St', latitude: null, longitude: null, geocode_status: null },
  ]);
  const outcome = await geocodeJobById(store, '4', { geocode: failLookup });
  assert.equal(outcome.result, 'failed');
  assert.equal(updates[0].patch.geocode_status, 'failed');
  assert.equal('latitude' in updates[0].patch, false, 'a failure never writes coordinates');
  assert.equal(table.get('4')?.latitude, null);
}

{
  const stale = { id: '5', location: '5 New St', latitude: 32.5, longitude: -111.5, geocode_status: 'stale' };
  const kept = memoryStore([stale]);
  assert.equal((await geocodeJobById(kept.store, '5', { geocode: okLookup })).result, 'already_pinned',
    'stale pin is kept unless the Fix dialog asks');

  const replaced = memoryStore([stale]);
  const outcome = await geocodeJobById(replaced.store, '5', { geocode: okLookup, replaceStale: true });
  assert.equal(outcome.result, 'pinned');
  assert.equal(replaced.updates[0].guard, 'stale');
  assert.equal(replaced.table.get('5')?.latitude, 32.1);

  const failed = memoryStore([stale]);
  await geocodeJobById(failed.store, '5', { geocode: failLookup, replaceStale: true });
  assert.equal(failed.updates.length, 0, 'failed re-lookup leaves the stale pin alone');
  assert.equal(failed.table.get('5')?.latitude, 32.5);
}

{
  const broken: JobGeocodeStore = {
    async load() { throw new Error('db down'); },
    async update() { return { count: 0 }; },
  };
  const outcome = await geocodeJobById(broken, '6', { geocode: okLookup });
  assert.equal(outcome.result, 'error', 'store errors are returned, not thrown');
}

// ── SMS post-insert step cannot throw or block ─────────────────────────────

{
  const throwing = { from: () => { throw new Error('boom'); } };
  const waited: Promise<unknown>[] = [];
  (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => waited.push(p) };
  const quiet = console.error;
  const loud = console.log;
  console.error = () => undefined;
  console.log = () => undefined;
  try {
    assert.equal(scheduleJobGeocode(throwing, 99), undefined, 'returns synchronously');
    assert.equal(scheduleJobGeocode(throwing, null), undefined);
    assert.equal(scheduleJobGeocode(throwing, 'not-an-id'), undefined);
    assert.equal(scheduleJobGeocode(null as never, 100), undefined, 'even a missing client does not throw');
    assert.equal(waited.length >= 1, true, 'runs under EdgeRuntime.waitUntil');
    await Promise.all(waited);
    await runJobGeocode(throwing, 101); // resolves, does not reject
    await runJobGeocode(null as never, 102);
  } finally {
    console.error = quiet;
    console.log = loud;
    delete (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime;
  }
}

console.log('geocode checks passed');

// ---- Tucson default for addresses with no city ----------------------------
{
  const { namesCityOrZip, nearTucson } = await import('../supabase/functions/_shared/geocode.ts');
  assert.equal(namesCityOrZip('4400 E Broadway'), false);
  assert.equal(namesCityOrZip('4400 E Broadway, AZ'), false);
  assert.equal(namesCityOrZip('1234 W Main St, Mesa'), true);
  assert.equal(namesCityOrZip('1234 W Main St Mesa AZ'), true);
  assert.equal(namesCityOrZip('500 W Duval Mine Rd Green Valley'), true);
  assert.equal(namesCityOrZip('100 E Congress St 85701'), true);
  assert.equal(nearTucson(32.2216, -110.8987), true);
  assert.equal(nearTucson(33.4079, -111.4984), false, 'Apache Junction is far');
  assert.equal(nearTucson(31.8698, -110.9937), true, 'Green Valley is near');
}

{
  // "4400 E Broadway": tried as Tucson first; Census returns the Tucson match.
  const { fetchImpl, calls } = fakeFetch({
    census: (url) => url.searchParams.get('address')?.includes('Tucson')
      ? censusHit(32.2216, -110.8987, '4400 E BROADWAY BLVD, TUCSON, AZ, 85711')
      : censusHit(33.4079, -111.4984, '4400 E BROADWAY AVE, APACHE JUNCTION, AZ'),
  });
  const result = await geocodeJobAddress('4400 E Broadway', { fetchImpl });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') assert.match(result.matchedAddress, /TUCSON/);
  assert.equal(calls[0].url.searchParams.get('address'), '4400 E Broadway, Tucson, AZ');
}

{
  // No city and the only match anywhere is Apache Junction: failed (Fix location), no pin.
  const { fetchImpl, calls } = fakeFetch({
    census: (url) => url.searchParams.get('address')?.includes('Tucson')
      ? censusNone
      : censusHit(33.4079, -111.4984, '4400 E BROADWAY AVE, APACHE JUNCTION, AZ'),
    nominatim: () => [{ lat: '33.4079', lon: '-111.4984', display_name: 'Apache Junction, Arizona' }],
  });
  const result = await geocodeJobAddress('4400 E Broadway', { fetchImpl });
  assert.equal(result.status, 'failed');
  if (result.status === 'failed') assert.match(result.message, /far from Tucson/);
  assert.equal(calls[2].url.searchParams.get('address'), '4400 E Broadway, AZ', 'falls back to the address as given');
}

{
  // An explicit city geocodes as given, even far from Tucson (DCS in Mesa).
  const { fetchImpl, calls } = fakeFetch({ census: () => censusHit(33.4152, -111.8315, '1234 W MAIN ST, MESA, AZ, 85201') });
  const result = await geocodeJobAddress('1234 W Main St, Mesa', { fetchImpl });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') assert.equal(result.latitude, 33.4152);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get('address'), '1234 W Main St, Mesa, AZ');
}

{
  // Green Valley is named: looked up as given.
  const { fetchImpl, calls } = fakeFetch({ census: () => censusHit(31.8698, -110.9937, 'GREEN VALLEY, AZ') });
  const result = await geocodeJobAddress('500 W Duval Mine Rd, Green Valley', { fetchImpl });
  assert.equal(result.status, 'ok');
  assert.equal(calls[0].url.searchParams.get('address'), '500 W Duval Mine Rd, Green Valley, AZ');
}
console.log('tucson-default geocode checks passed');
