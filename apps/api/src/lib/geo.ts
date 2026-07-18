/**
 * Helpers for building PostGIS literals in $queryRaw calls.
 *
 * Prisma's tagged-template parameterises these values, so they are never
 * string-concatenated into SQL. Everything here takes plain numbers that have
 * already been range-checked by Zod at the request boundary.
 */

/** SRID 4326 is WGS84 — what GPS and every map tile server speak. */
export const SRID = 4326;

/**
 * WKT for a point. PostGIS reads POINT as (x y) = (longitude latitude);
 * writing it lat-first is the single most common geo bug, so it is spelled
 * out here once and never repeated inline.
 */
export function pointWkt(lat: number, lng: number): string {
  return `SRID=${SRID};POINT(${lng} ${lat})`;
}

/** WKT for a LineString from OSRM's [lng, lat] coordinate list. */
export function lineStringWkt(coordinates: [number, number][]): string {
  if (coordinates.length < 2) {
    throw new Error('A LineString needs at least 2 coordinates');
  }
  const pairs = coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(',');
  return `SRID=${SRID};LINESTRING(${pairs})`;
}

/**
 * Great-circle distance in metres. Used only for cheap local maths (ETA
 * smoothing, simulator steps) — anything that must agree with the database
 * uses ST_Distance on geography instead.
 */
export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
