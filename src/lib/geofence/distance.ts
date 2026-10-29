const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in meters between two WGS84 points. */
export function distanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(latitudeB - latitudeA);
  const dLon = toRad(longitudeB - longitudeA);
  const lat1 = toRad(latitudeA);
  const lat2 = toRad(latitudeB);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
