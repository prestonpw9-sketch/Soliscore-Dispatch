/**
 * Optional address → coordinate lookup for job sites.
 * Not called when the app loads, and it never writes to Supabase.
 * Preston can run `node --experimental-strip-types scripts/geocode-job-address.ts "<address>"`
 * and copy the printed latitude / longitude onto the job after the geofence
 * migration is applied.
 *
 * Uses OpenStreetMap Nominatim. Their usage policy asks for a real User-Agent
 * and about one request per second. Do not loop this over the whole jobs table.
 */

export interface GeocodeHit {
  latitude: number;
  longitude: number;
  label: string;
}

export type GeocodeResult =
  | { ok: true; hit: GeocodeHit }
  | { ok: false; message: string };

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'ITDG-Dispatch/1.0 (job-site geocoding; https://app.solidcoreplumb.com)';

export async function geocodeAddress(
  address: string,
  options?: { fetchImpl?: typeof fetch; signal?: AbortSignal },
): Promise<GeocodeResult> {
  const query = address.trim();
  if (!query) return { ok: false, message: 'Address is empty.' };

  const fetchImpl = options?.fetchImpl ?? fetch;
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', query);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: options?.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Geocoding request failed.';
    return { ok: false, message };
  }

  if (!response.ok) {
    return { ok: false, message: `Geocoder responded ${response.status}.` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, message: 'Geocoder returned unreadable JSON.' };
  }

  if (!Array.isArray(body) || body.length === 0) {
    return { ok: false, message: 'No coordinates found for that address.' };
  }

  const row = body[0] as { lat?: unknown; lon?: unknown; display_name?: unknown };
  const latitude = Number(row.lat);
  const longitude = Number(row.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, message: 'Geocoder returned invalid coordinates.' };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ok: false, message: 'Geocoder returned coordinates outside WGS84.' };
  }

  return {
    ok: true,
    hit: {
      latitude,
      longitude,
      label: typeof row.display_name === 'string' && row.display_name.trim()
        ? row.display_name.trim()
        : query,
    },
  };
}

/** Column patch for public.jobs. The caller decides whether to save it. */
export function jobGeofenceUpdate(
  hit: GeocodeHit,
  radiusMeters = 90,
): { latitude: number; longitude: number; geofence_radius_m: number } {
  const radius = Number.isFinite(radiusMeters) ? Math.round(radiusMeters) : 90;
  const geofence_radius_m = Math.min(1000, Math.max(30, radius));
  return {
    latitude: hit.latitude,
    longitude: hit.longitude,
    geofence_radius_m,
  };
}
