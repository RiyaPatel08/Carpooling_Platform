import { SOCKET_EVENTS } from '@syncroute/shared';
import { prisma } from '../db.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { emitToTrip } from '../realtime/io.js';
import { recordPing } from './tracking.service.js';

/**
 * Server-side trip simulation.
 *
 * PLANNING §7 already calls the location simulator a first-class tool rather
 * than a hack, for a blunt reason: a venue's wifi and GPS are not ours to
 * trust, and "live tracking" is the headline USP. The CLI simulator covers a
 * scripted demo from a laptop; this covers the case that actually happens on
 * stage — a judge holding the phone, asking to see the marker move.
 *
 * It replays the ride's REAL OSRM polyline through recordPing, the same
 * function the driver's GPS calls. That matters: ETA, remaining distance,
 * deviation strikes and the trip_locations audit trail are all produced by
 * the production path, so a simulated trip is indistinguishable from a driven
 * one except for where the coordinates came from.
 */

interface Running {
  timer: ReturnType<typeof setInterval>;
  startedBy: string;
}

/**
 * ponytail: in-process map, so simulations die with a restart and a
 * multi-node deploy would not see each other's. Same ceiling and same fix as
 * the deviation-strike counter in tracking.service — a Redis key if the API
 * ever runs more than one process.
 */
const running = new Map<string, Running>();

/** Metres between synthesised pings — roughly a city block at demo speed. */
const STEP_M = 120;
/** Wall-clock gap between pings. Matches the driver app's 3s GPS cadence. */
const TICK_MS = 1200;
/** How far off-route the deviation demo drags the vehicle. */
const DEVIATION_OFFSET_DEG = 0.012;

export function isSimulating(tripId: string): boolean {
  return running.has(tripId);
}

export function stop(tripId: string): boolean {
  const sim = running.get(tripId);
  if (!sim) return false;
  clearInterval(sim.timer);
  running.delete(tripId);
  emitToTrip(tripId, SOCKET_EVENTS.tripStatus, {
    tripId,
    status: 'in_progress',
    message: 'Simulation stopped',
  });
  return true;
}

/**
 * Walk the route and emit a ping every TICK_MS.
 *
 * `deviate` drags the second half of the journey off-corridor so the
 * route-deviation alert fires on cue — demo beat 7 in PLANNING §12, which is
 * otherwise impossible to show without actually driving the wrong way.
 */
export async function start(
  tripId: string,
  userId: string,
  orgId: string,
  opts: { deviate?: boolean; speedFactor?: number } = {},
): Promise<{ points: number; etaSeconds: number }> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { ride: { select: { id: true, orgId: true, driverId: true } } },
  });
  if (!trip || trip.ride.orgId !== orgId) throw notFound('Trip not found');
  // Only the driver may fabricate position: the same rule the socket handler
  // enforces for real pings, for the same reason.
  if (trip.ride.driverId !== userId) {
    throw forbidden('Only the driver can simulate this trip');
  }
  if (!['started', 'in_progress'].includes(trip.status)) {
    throw conflict('Start the trip before simulating movement');
  }
  if (running.has(tripId)) throw conflict('This trip is already being simulated');

  const rows = await prisma.$queryRaw<{ geojson: string | null }[]>`
    SELECT ST_AsGeoJSON(
             -- Resample the route to evenly spaced points so the marker moves
             -- at a steady speed instead of sprinting between sparse vertices.
             ST_Segmentize(route_geom, ${STEP_M})::geometry
           ) AS geojson
    FROM rides
    WHERE id = ${trip.ride.id} AND route_geom IS NOT NULL
  `;
  if (!rows.length || !rows[0].geojson) {
    throw conflict('This ride has no stored route to simulate');
  }

  const { coordinates } = JSON.parse(rows[0].geojson) as {
    coordinates: [number, number][];
  };
  if (coordinates.length < 2) throw conflict('This ride has no stored route to simulate');

  const tick = Math.max(200, Math.round(TICK_MS / (opts.speedFactor ?? 1)));
  const deviateFrom = opts.deviate ? Math.floor(coordinates.length * 0.5) : Infinity;

  let i = 0;
  const timer = setInterval(() => {
    void (async () => {
      if (i >= coordinates.length) {
        stop(tripId);
        return;
      }

      const [lng, lat] = coordinates[i];
      // Push progressively sideways once past the deviation point, so the
      // strike counter sees a sustained drift rather than one bad fix.
      const drift =
        i >= deviateFrom
          ? Math.min((i - deviateFrom) * 0.0012, DEVIATION_OFFSET_DEG)
          : 0;
      i += 1;

      try {
        const result = await recordPing({
          tripId,
          lat: lat + drift,
          lng,
          // 40 km/h in m/s, reported the same way the phone reports it.
          speed: 11.1,
        });
        emitToTrip(tripId, SOCKET_EVENTS.locationBroadcast, result.broadcast);
        if (result.alert) emitToTrip(tripId, SOCKET_EVENTS.safetyAlert, result.alert);
      } catch {
        // A ping that fails mid-simulation (trip completed from another
        // device, DB blip) ends the replay rather than looping on errors.
        stop(tripId);
      }
    })();
  }, tick);

  running.set(tripId, { timer, startedBy: userId });

  return {
    points: coordinates.length,
    etaSeconds: Math.round((coordinates.length * tick) / 1000),
  };
}
