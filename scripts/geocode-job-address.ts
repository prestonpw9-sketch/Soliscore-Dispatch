/**
 * Optional helper: print coordinates for one job address.
 * Does not read or write Supabase. Apply the geofence migration first, then
 * copy the printed columns onto the job when Preston is ready.
 *
 *   node --experimental-strip-types scripts/geocode-job-address.ts "100 E Congress St, Tucson, AZ"
 */
import { geocodeAddress, jobGeofenceUpdate } from '../src/lib/geocodeAddress.ts';

const address = process.argv.slice(2).join(' ').trim();
if (!address) {
  console.error('Usage: node --experimental-strip-types scripts/geocode-job-address.ts "<job address>"');
  process.exit(1);
}

const result = await geocodeAddress(address);
if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}

console.log(JSON.stringify({
  address,
  label: result.hit.label,
  ...jobGeofenceUpdate(result.hit),
  note: 'Not written to the database. Paste latitude, longitude, and geofence_radius_m onto the job after the migration is applied.',
}, null, 2));
