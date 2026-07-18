import type { LocationUpdate, LocationBroadcast, SafetyAlert } from '@syncroute/shared';
import { prisma } from '../db.js';
import { pointWkt } from '../lib/geo.js';
import { config } from '../config.js';
import { markInProgress } from './trip.service.js';
import { notFound } from '../lib/errors.js';

/**
 * Consecutive off-corridor pings per trip.
 *
 * ponytail: in-process map, so a restart forgets mid-trip strike counts and
 * multi-node deployment would each keep their own. Move to a Redis counter
 * keyed by trip if the API is ever scaled past one process — same place the
 * Socket.IO Redis adapter would go.
 */
const deviationStrikes = new Map<string, number>();

interface PingResult {
  broadcast: LocationBroadcast;
  alert: SafetyAlert | null;
}

/**
 * Persist a GPS ping and derive everything the passenger's screen needs.
 *
 * All three numbers come from one round trip to PostGIS:
 *  - offRouteM:  ST_Distance to the planned route -> deviation detection
 *  - remainingM: how much of the route is still ahead -> ETA
 * Computing these in SQL keeps the geometry next to the data and means the
 * ETA agrees with the same LineString the map is drawing.
 */
export async function recordPing(input: LocationUpdate): Promise<PingResult> {
  const trip = await prisma.trip.findUnique({
    where: { id: input.tripId },
    include: { ride: { select: { id: true, routeDurationS: true, routeDistanceM: true } } },
  });
  if (!trip) throw notFound('Trip not found');

  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
  const wkt = pointWkt(input.lat, input.lng);

  const rows = await prisma.$queryRaw<
    { off_route_m: number | null; remaining_m: number | null }[]
  >`
    WITH ping AS (
      SELECT ST_GeogFromText(${wkt}) AS pt
    ),
    ins AS (
      INSERT INTO trip_locations (id, trip_id, pt, speed, recorded_at)
      SELECT gen_random_uuid()::text, ${input.tripId}, ping.pt, ${input.speed ?? null}, ${recordedAt}
      FROM ping
      RETURNING trip_id
    )
    SELECT
      -- Perpendicular distance from the planned corridor, in metres.
      ST_Distance(r.route_geom, ping.pt) AS off_route_m,
      -- Route length still ahead: total length minus the fraction already
      -- covered, using the projection of the ping onto the line.
      (1 - ST_LineLocatePoint(r.route_geom::geometry, ping.pt::geometry))
        * ST_Length(r.route_geom) AS remaining_m
    FROM rides r
    CROSS JOIN ping
    WHERE r.id = ${trip.ride.id} AND r.route_geom IS NOT NULL
  `;

  const offRouteM = rows[0]?.off_route_m ?? null;
  const remainingM = rows[0]?.remaining_m ?? null;

  // ETA from the ride's own average speed over its planned route — steadier
  // than instantaneous GPS speed, which swings wildly at traffic lights.
  let etaSeconds: number | null = null;
  if (remainingM != null && trip.ride.routeDistanceM && trip.ride.routeDurationS) {
    const avgSpeedMps = trip.ride.routeDistanceM / trip.ride.routeDurationS;
    if (avgSpeedMps > 0) etaSeconds = Math.max(0, Math.round(remainingM / avgSpeedMps));
  }

  // First ping of a started trip advances the lifecycle.
  if (trip.status === 'started') await markInProgress(input.tripId);

  const broadcast: LocationBroadcast = {
    tripId: input.tripId,
    lat: input.lat,
    lng: input.lng,
    speed: input.speed ?? null,
    recordedAt: recordedAt.toISOString(),
    remainingM: remainingM == null ? null : Math.round(remainingM),
    etaSeconds,
    offRouteM: offRouteM == null ? null : Math.round(offRouteM),
  };

  const alert = await evaluateDeviation(input.tripId, offRouteM, input);
  return { broadcast, alert };
}

/**
 * Route-deviation alert.
 *
 * A single off-corridor ping means nothing — GPS drifts, and a detour round a
 * closed road is normal. Requiring DEVIATION_STRIKES consecutive pings beyond
 * the threshold is what separates "noisy signal" from "this vehicle is not
 * going where it said it would". Any ping back on route resets the count.
 */
async function evaluateDeviation(
  tripId: string,
  offRouteM: number | null,
  input: LocationUpdate,
): Promise<SafetyAlert | null> {
  if (offRouteM == null) return null;

  if (offRouteM <= config.DEVIATION_THRESHOLD_M) {
    deviationStrikes.delete(tripId);
    return null;
  }

  const strikes = (deviationStrikes.get(tripId) ?? 0) + 1;
  deviationStrikes.set(tripId, strikes);

  if (strikes < config.DEVIATION_STRIKES) return null;

  // Fire once per sustained deviation, not once per ping after the third.
  deviationStrikes.set(tripId, 0);

  const detail =
    `Vehicle is ${Math.round(offRouteM)} m off the planned route ` +
    `for ${config.DEVIATION_STRIKES} consecutive updates`;

  const rows = await prisma.$queryRaw<{ id: string; created_at: Date }[]>`
    INSERT INTO safety_events (id, trip_id, kind, pt, detail, created_at)
    VALUES (
      gen_random_uuid()::text, ${tripId}, 'route_deviation',
      ST_GeogFromText(${pointWkt(input.lat, input.lng)}), ${detail}, NOW()
    )
    RETURNING id, created_at
  `;

  return {
    tripId,
    kind: 'route_deviation',
    point: { lat: input.lat, lng: input.lng },
    offRouteM: Math.round(offRouteM),
    detail,
    createdAt: rows[0].created_at.toISOString(),
  };
}

/** Passenger-triggered SOS. Always recorded, never rate-limited. */
export async function recordSos(
  input: { tripId: string; lat?: number; lng?: number },
  userId: string,
): Promise<SafetyAlert> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const detail = `SOS raised by ${user?.name ?? 'a passenger'}`;
  const hasPoint = input.lat != null && input.lng != null;

  const rows = hasPoint
    ? await prisma.$queryRaw<{ id: string; created_at: Date }[]>`
        INSERT INTO safety_events (id, trip_id, kind, pt, detail, created_at)
        VALUES (
          gen_random_uuid()::text, ${input.tripId}, 'sos',
          ST_GeogFromText(${pointWkt(input.lat!, input.lng!)}), ${detail}, NOW()
        )
        RETURNING id, created_at
      `
    : await prisma.$queryRaw<{ id: string; created_at: Date }[]>`
        INSERT INTO safety_events (id, trip_id, kind, detail, created_at)
        VALUES (gen_random_uuid()::text, ${input.tripId}, 'sos', ${detail}, NOW())
        RETURNING id, created_at
      `;

  return {
    tripId: input.tripId,
    kind: 'sos',
    point: hasPoint ? { lat: input.lat!, lng: input.lng! } : null,
    offRouteM: null,
    detail,
    createdAt: rows[0].created_at.toISOString(),
  };
}

/** Replay a trip's recorded path — Track Ride opens with history, not a blank map. */
export async function trackHistory(tripId: string) {
  return prisma.$queryRaw<{ lat: number; lng: number; speed: number | null; recorded_at: Date }[]>`
    SELECT ST_Y(pt::geometry) AS lat, ST_X(pt::geometry) AS lng, speed, recorded_at
    FROM trip_locations
    WHERE trip_id = ${tripId}
    ORDER BY recorded_at ASC
  `;
}
