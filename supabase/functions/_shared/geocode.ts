/**
 * Job-address geocoder used by the geocode-job edge function, the SMS
 * post-insert step, and scripts/backfill-job-geocodes.ts.
 *
 * US Census Geocoder first (free, no key, US street addresses), then
 * OpenStreetMap Nominatim. Both are biased to Arizona: an address with no
 * state gets ", AZ" appended, and a match outside Arizona is rejected unless
 * the address names another state.
 *
 * No Deno or Node APIs here so the same file runs in both. fetch is injected
 * for tests.
 */

export type GeocodeSource = 'census' | 'nominatim';

export type JobGeocodeResult =
  | {
    status: 'ok';
    latitude: number;
    longitude: number;
    matchedAddress: string;
    source: GeocodeSource;
  }
  | { status: 'failed' | 'no_address'; message: string };

export interface GeocodeOptions {
  fetchImpl?: typeof fetch;
  /** Nominatim requires a real User-Agent. */
  userAgent?: string;
  timeoutMs?: number;
}

export const GEOCODE_USER_AGENT =
  'ITDG-Dispatch/1.0 (job-site geocoding; https://app.solidcoreplumb.com)';

/** Loose box around Arizona. */
export const ARIZONA_BOUNDS = {
  south: 31.33,
  north: 37.01,
  west: -114.82,
  east: -109.04,
} as const;

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

const PLACEHOLDERS = new Set([
  '',
  'address pending',
  'pending',
  'tbd',
  'tba',
  'n/a',
  'na',
  'none',
  'unknown',
  '-',
  '—',
]);

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC',
]);

export function cleanAddress(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Blank, a placeholder, or only a city ("Tucson, AZ" is the app default when
 * no address was typed). A city-center pin would put the geofence in the
 * wrong place, so these are not sent to a geocoder.
 */
export function isPlaceholderAddress(raw: unknown): boolean {
  const address = cleanAddress(raw);
  if (PLACEHOLDERS.has(address.toLowerCase())) return true;
  if (/\d/.test(address)) return false;
  // No digits: "Tucson, AZ", "Marana", "Oro Valley Arizona".
  const words = address.replace(/[,.]/g, ' ').split(' ').filter(Boolean);
  return words.length <= 4;
}

/** Two-letter state other than AZ, or a ZIP outside 85xxx / 86xxx. */
export function namesOtherState(raw: string): boolean {
  const address = cleanAddress(raw);
  if (/\barizona\b/i.test(address)) return false;
  const zip = /\b(\d{5})(?:-\d{4})?\s*$/.exec(address);
  if (zip && !/^8[56]/.test(zip[1])) return true;
  const state = /,\s*([A-Za-z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec(address);
  if (state) {
    const code = state[1].toUpperCase();
    return US_STATES.has(code) && code !== 'AZ';
  }
  return false;
}

/** Appends ", AZ" when the address does not already name a state or ZIP. */
export function withArizonaBias(raw: string): string {
  const address = cleanAddress(raw);
  if (/\b(az|arizona)\b/i.test(address)) return address;
  if (namesOtherState(address)) return address;
  if (/\b\d{5}(?:-\d{4})?\s*$/.test(address)) return address;
  return `${address.replace(/,\s*$/, '')}, AZ`;
}

export function inArizona(latitude: number, longitude: number): boolean {
  return latitude >= ARIZONA_BOUNDS.south
    && latitude <= ARIZONA_BOUNDS.north
    && longitude >= ARIZONA_BOUNDS.west
    && longitude <= ARIZONA_BOUNDS.east;
}

function validCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

interface Candidate {
  latitude: number;
  longitude: number;
  label: string;
}

function pickCandidate(candidates: Candidate[], allowOutside: boolean): Candidate | null {
  const valid = candidates.filter(c => validCoordinate(c.latitude, c.longitude));
  const local = valid.find(c => inArizona(c.latitude, c.longitude));
  if (local) return local;
  return allowOutside ? valid[0] ?? null : null;
}

async function getJson(
  url: URL,
  options: GeocodeOptions,
): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': options.userAgent ?? GEOCODE_USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, message: `${url.hostname} responded ${response.status}.` };
    try {
      return { ok: true, body: await response.json() };
    } catch {
      return { ok: false, message: `${url.hostname} returned unreadable JSON.` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'request failed';
    return { ok: false, message: `${url.hostname}: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodeCensus(
  address: string,
  options: GeocodeOptions = {},
): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; message: string }> {
  const url = new URL(CENSUS_URL);
  url.searchParams.set('address', address);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');
  const reply = await getJson(url, options);
  if (reply.ok === false) return { ok: false, message: reply.message };
  const matches = (reply.body as { result?: { addressMatches?: unknown } })?.result?.addressMatches;
  if (!Array.isArray(matches)) return { ok: false, message: 'Census returned no result list.' };
  const candidates = matches.flatMap((match): Candidate[] => {
    const row = match as { matchedAddress?: unknown; coordinates?: { x?: unknown; y?: unknown } };
    const latitude = Number(row.coordinates?.y);
    const longitude = Number(row.coordinates?.x);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{
      latitude,
      longitude,
      label: typeof row.matchedAddress === 'string' ? row.matchedAddress : address,
    }];
  });
  return { ok: true, candidates };
}

export async function geocodeNominatim(
  address: string,
  options: GeocodeOptions = {},
): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; message: string }> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('countrycodes', 'us');
  // viewbox biases toward Arizona; bounded=0 still allows a named other state.
  url.searchParams.set(
    'viewbox',
    `${ARIZONA_BOUNDS.west},${ARIZONA_BOUNDS.north},${ARIZONA_BOUNDS.east},${ARIZONA_BOUNDS.south}`,
  );
  url.searchParams.set('bounded', '0');
  url.searchParams.set('q', address);
  const reply = await getJson(url, options);
  if (reply.ok === false) return { ok: false, message: reply.message };
  if (!Array.isArray(reply.body)) return { ok: false, message: 'Nominatim returned no result list.' };
  const candidates = reply.body.flatMap((item): Candidate[] => {
    const row = item as { lat?: unknown; lon?: unknown; display_name?: unknown };
    const latitude = Number(row.lat);
    const longitude = Number(row.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{
      latitude,
      longitude,
      label: typeof row.display_name === 'string' ? row.display_name : address,
    }];
  });
  return { ok: true, candidates };
}

/** Census first, then Nominatim. Never throws. */
export async function geocodeJobAddress(
  rawAddress: unknown,
  options: GeocodeOptions = {},
): Promise<JobGeocodeResult> {
  const address = cleanAddress(rawAddress);
  if (isPlaceholderAddress(address)) {
    return { status: 'no_address', message: 'No street address to look up.' };
  }
  const query = withArizonaBias(address);
  const allowOutside = namesOtherState(address);
  const problems: string[] = [];

  try {
    const census = await geocodeCensus(query, options);
    if (census.ok === true) {
      const hit = pickCandidate(census.candidates, allowOutside);
      if (hit) {
        return {
          status: 'ok',
          latitude: hit.latitude,
          longitude: hit.longitude,
          matchedAddress: hit.label,
          source: 'census',
        };
      }
      problems.push(census.candidates.length ? 'Census match was outside Arizona.' : 'Census found no match.');
    } else {
      problems.push(census.message);
    }

    const osm = await geocodeNominatim(query, options);
    if (osm.ok === true) {
      const hit = pickCandidate(osm.candidates, allowOutside);
      if (hit) {
        return {
          status: 'ok',
          latitude: hit.latitude,
          longitude: hit.longitude,
          matchedAddress: hit.label,
          source: 'nominatim',
        };
      }
      problems.push(osm.candidates.length ? 'Nominatim match was outside Arizona.' : 'Nominatim found no match.');
    } else {
      problems.push(osm.message);
    }
  } catch (err) {
    problems.push(err instanceof Error ? err.message : 'Geocoder failed.');
  }

  return { status: 'failed', message: problems.join(' ') || 'No coordinates found.' };
}

/** "32.2226, -110.9747" or "32.2226 -110.9747" → numbers. Null if invalid. */
export function parseLatLng(raw: unknown): { latitude: number; longitude: number } | null {
  const text = String(raw ?? '').trim();
  const match = /^\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/.exec(text);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!validCoordinate(latitude, longitude)) return null;
  return { latitude, longitude };
}
