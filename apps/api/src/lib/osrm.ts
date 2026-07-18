import { config } from '../config.js';
import { badGateway } from './errors.js';

export interface RoutedLeg {
  distanceM: number;
  durationS: number;
  /** GeoJSON order: [lng, lat]. Matches PostGIS ST_MakePoint(lng, lat). */
  coordinates: [number, number][];
}

/**
 * OSRM client. Points at routing.openstreetmap.de by default; set OSRM_URL to
 * a self-hosted instance (see scripts/osrm-prepare.sh) to drop the external
 * dependency entirely. Nothing else in the codebase knows which is in use.
 */
async function osrmRoute(
  coords: [number, number][],
  opts: { overview: 'full' | 'false' } = { overview: 'full' },
): Promise<RoutedLeg> {
  const path = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url =
    `${config.OSRM_URL}/route/v1/driving/${path}` +
    `?overview=${opts.overview}&geometries=geojson&steps=false`;

  let res: Response;
  try {
    // The public instance occasionally stalls; a hung request must not hold a
    // seat lock or block the publish flow.
    res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  } catch (err) {
    throw badGateway(`Routing service unreachable: ${(err as Error).message}`);
  }

  if (!res.ok) throw badGateway(`Routing service returned ${res.status}`);

  const body = (await res.json()) as {
    code: string;
    routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[];
  };

  if (body.code !== 'Ok' || !body.routes?.length) {
    throw badGateway('No drivable route found between those locations');
  }

  const route = body.routes[0];
  return {
    distanceM: Math.round(route.distance),
    durationS: Math.round(route.duration),
    coordinates: route.geometry?.coordinates ?? [],
  };
}

/** Origin → destination, with full geometry for storage as route_geom. */
export function routeBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<RoutedLeg> {
  return osrmRoute([
    [from.lng, from.lat],
    [to.lng, to.lat],
  ]);
}

/**
 * Detour cost of inserting a passenger's pickup and drop as waypoints.
 * Geometry is skipped (overview=false) because only the duration delta
 * matters here and this runs once per candidate ride.
 */
export function routeVia(
  origin: { lat: number; lng: number },
  pickup: { lat: number; lng: number },
  drop: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<RoutedLeg> {
  return osrmRoute(
    [
      [origin.lng, origin.lat],
      [pickup.lng, pickup.lat],
      [drop.lng, drop.lat],
      [destination.lng, destination.lat],
    ],
    { overview: 'false' },
  );
}
