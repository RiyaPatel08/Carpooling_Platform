import { Prisma } from '@prisma/client';
import type { RideCreateInput, RideSearchInput, RideSummary } from '@syncroute/shared';
import { prisma } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { routeBetween, routeVia } from '../lib/osrm.js';
import { pointWkt, lineStringWkt } from '../lib/geo.js';
import { suggestFare, bookingFare } from './fare.service.js';
import { config } from '../config.js';

/**
 * Publish a ride.
 *
 * The route is fetched from OSRM and stored as a geography LineString, not
 * just as two endpoints. That single decision is what makes corridor matching
 * possible later: we can ask "is this passenger near the road you actually
 * drive" instead of "are your endpoints near mine".
 */
export async function publish(
  driverId: string,
  orgId: string,
  input: RideCreateInput,
): Promise<{ id: string }> {
  // Block if the driver already has an active (published / started) ride.
  const activeRide = await prisma.ride.findFirst({
    where: { driverId, status: { in: ['published', 'started'] } },
    select: { id: true },
  });
  if (activeRide) throw conflict('You already have an active ride. Complete or cancel it before offering another.');

  const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
  if (!vehicle) throw notFound('Vehicle not found');
  if (vehicle.ownerId !== driverId) throw forbidden('You can only offer rides in your own vehicle');
  if (vehicle.status !== 'approved') {
    throw conflict(
      vehicle.status === 'pending'
        ? 'Your vehicle is awaiting administrator approval'
        : 'That vehicle is inactive and cannot be used for rides',
    );
  }
  // seatsTotal excludes the driver, so a 4-seat car can offer at most 3.
  if (input.seatsTotal > vehicle.seatingCapacity - 1) {
    throw badRequest(
      `Your ${vehicle.model} seats ${vehicle.seatingCapacity}, so you can offer at most ${vehicle.seatingCapacity - 1} seats`,
    );
  }

  // One active ride at a time: a driver mid-carpool cannot also be
  // publishing a second one. They must complete or cancel the first.
  // chk_one_active_ride_per_driver is the database backstop for this.
  const activeRide = await prisma.ride.findFirst({
    where: { driverId, status: { in: ['published', 'started'] } },
  });
  if (activeRide) {
    throw conflict(
      'You already have an ongoing ride. Complete or cancel it before publishing another.',
      'ACTIVE_RIDE_EXISTS',
    );
  }

  const route = await routeBetween(input.origin, input.destination);
  if (route.coordinates.length < 2) {
    throw badRequest('Could not calculate a route between those locations');
  }

  // Geography columns cannot be written through Prisma Client, so the insert
  // is raw. Values are still parameterised by the tagged template.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO rides (
      id, org_id, driver_id, vehicle_id,
      origin_label, dest_label,
      origin_pt, dest_pt, route_geom,
      route_distance_m, route_duration_s,
      departure_at, seats_total, seats_available,
      fare_per_seat, recurrence_rule, status, created_at
    ) VALUES (
      gen_random_uuid()::text, ${orgId}, ${driverId}, ${input.vehicleId},
      ${input.origin.label}, ${input.destination.label},
      ST_GeogFromText(${pointWkt(input.origin.lat, input.origin.lng)}),
      ST_GeogFromText(${pointWkt(input.destination.lat, input.destination.lng)}),
      ST_GeogFromText(${lineStringWkt(route.coordinates)}),
      ${route.distanceM}, ${route.durationS},
      ${input.departureAt}, ${input.seatsTotal}, ${input.seatsTotal},
      ${new Prisma.Decimal(input.farePerSeat)}, ${input.recurrenceRule ?? null},
      'published', NOW()
    )
    RETURNING id
  `;

  const rideId = rows[0].id;

  // Every ride gets its trip row up front so the socket room, chat and status
  // machine have something to attach to from the moment it is booked.
  await prisma.trip.create({ data: { rideId, status: 'booked' } });

  return { id: rideId };
}

/** Fare suggestion for the Offer Ride form, using org + vehicle config. */
export async function suggestFareForVehicle(
  orgId: string,
  vehicleId: string,
  distanceM: number,
  seatsTotal: number,
) {
  const [org, vehicle] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.vehicle.findUnique({ where: { id: vehicleId } }),
  ]);
  if (!org) throw notFound('Organization not found');
  if (!vehicle) throw notFound('Vehicle not found');
  if (vehicle.orgId !== orgId) throw notFound('Vehicle not found');

  return suggestFare({
    distanceM,
    // Vehicle mileage when the owner supplied it, else the org default.
    mileageKmpl: Number(vehicle.mileageKmpl ?? org.defaultMileageKmpl),
    fuelCostPerLitre: Number(org.fuelCostPerLitre),
    seatsTotal,
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface RideRow {
  id: string;
  origin_label: string;
  dest_label: string;
  departure_at: Date;
  seats_total: number;
  seats_available: number;
  fare_per_seat: Prisma.Decimal;
  route_distance_m: number | null;
  route_duration_s: number | null;
  recurrence_rule: string | null;
  status: 'published' | 'started' | 'completed' | 'cancelled';
  driver_id: string;
  driver_name: string;
  driver_photo: string | null;
  vehicle_model: string;
  vehicle_reg: string;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  pickup_frac?: number;
  drop_frac?: number;
}

function toSummary(r: RideRow, detourMinutes?: number | null, score?: number | null): RideSummary {
  // Corridor results carry the passenger's position along the route; baseline
  // results do not, and a baseline match is the whole route by definition.
  const fraction =
    r.pickup_frac != null && r.drop_frac != null ? r.drop_frac - r.pickup_frac : 1;

  return {
    id: r.id,
    driver: { id: r.driver_id, name: r.driver_name, photoUrl: r.driver_photo },
    vehicle: { model: r.vehicle_model, registrationNo: r.vehicle_reg },
    originLabel: r.origin_label,
    destLabel: r.dest_label,
    departureAt: r.departure_at.toISOString(),
    seatsTotal: r.seats_total,
    seatsAvailable: r.seats_available,
    farePerSeat: Number(r.fare_per_seat),
    routeDistanceM: r.route_distance_m,
    routeDurationS: r.route_duration_s,
    recurrenceRule: r.recurrence_rule,
    status: r.status,
    detourMinutes: detourMinutes ?? null,
    matchScore: score ?? null,
    // Same function the booking transaction uses, so the quoted price is the
    // charged price.
    yourFarePerSeat: bookingFare(Number(r.fare_per_seat), 1, fraction),
  };
}

/**
 * Ride search.
 *
 * With pickup/drop coordinates this runs the corridor algorithm; without
 * them it falls back to the baseline org-wide time-window listing, which is
 * what the mockup's plain "Find Ride" produces.
 */
export async function search(
  orgId: string,
  userId: string,
  q: RideSearchInput,
): Promise<RideSummary[]> {
  const hasCorridor =
    q.fromLat !== undefined && q.fromLng !== undefined && q.toLat !== undefined && q.toLng !== undefined;

  const anchor = q.date ?? new Date();
  const windowMs = q.windowHours * 3_600_000;
  const from = new Date(anchor.getTime() - windowMs);
  const to = new Date(anchor.getTime() + windowMs);
  // Never surface rides that have already left.
  const earliest = from.getTime() < Date.now() ? new Date() : from;

  return hasCorridor
    ? corridorSearch(orgId, userId, q, earliest, to)
    : baselineSearch(orgId, userId, q, earliest, to);
}

/** Baseline: every open ride in the org inside the departure window. */
async function baselineSearch(
  orgId: string,
  userId: string,
  q: RideSearchInput,
  from: Date,
  to: Date,
): Promise<RideSummary[]> {
  const rows = await prisma.$queryRaw<RideRow[]>`
    SELECT
      r.id, r.origin_label, r.dest_label, r.departure_at,
      r.seats_total, r.seats_available, r.fare_per_seat,
      r.route_distance_m, r.route_duration_s, r.recurrence_rule, r.status,
      u.id AS driver_id, u.name AS driver_name, u.photo_url AS driver_photo,
      v.model AS vehicle_model, v.registration_no AS vehicle_reg,
      ST_Y(r.origin_pt::geometry) AS origin_lat, ST_X(r.origin_pt::geometry) AS origin_lng,
      ST_Y(r.dest_pt::geometry)   AS dest_lat,   ST_X(r.dest_pt::geometry)   AS dest_lng
    FROM rides r
    JOIN users u    ON u.id = r.driver_id
    JOIN vehicles v ON v.id = r.vehicle_id
    WHERE r.org_id = ${orgId}
      AND r.status = 'published'
      AND r.seats_available >= ${q.seats}
      AND r.departure_at BETWEEN ${from} AND ${to}
      AND r.driver_id <> ${userId}
    ORDER BY r.departure_at ASC, r.fare_per_seat ASC
    LIMIT 50
  `;
  return rows.map((r) => toSummary(r));
}

/**
 * Corridor matching — BlaBlaCar's published two-step, adapted.
 *
 * Step 1 (SQL, indexed): keep rides whose route passes within
 *   CORRIDOR_RADIUS_M of BOTH the passenger's pickup and drop. ST_DWithin on
 *   geography hits the GiST index, so this is a bounding-box filter first.
 *
 * Step 2 (SQL): direction check. ST_LineLocatePoint returns how far along the
 *   route a point falls, as a 0-1 fraction. Requiring pickup < drop rejects
 *   the driver going the opposite way down the same road — the case pure
 *   proximity matching gets wrong.
 *
 * Step 3 (OSRM, top-N only): re-route the driver via the passenger's pickup
 *   and drop and measure the real added minutes. This is the "+4 min detour"
 *   the demo hangs on, and it is why we cap N — each one is a network call.
 */
async function corridorSearch(
  orgId: string,
  userId: string,
  q: RideSearchInput,
  from: Date,
  to: Date,
): Promise<RideSummary[]> {
  const pickup = pointWkt(q.fromLat!, q.fromLng!);
  const drop = pointWkt(q.toLat!, q.toLng!);
  const radius = config.CORRIDOR_RADIUS_M;

  const rows = await prisma.$queryRaw<RideRow[]>`
    WITH passenger AS (
      SELECT
        ST_GeogFromText(${pickup}) AS pickup_pt,
        ST_GeogFromText(${drop})   AS drop_pt
    )
    SELECT
      r.id, r.origin_label, r.dest_label, r.departure_at,
      r.seats_total, r.seats_available, r.fare_per_seat,
      r.route_distance_m, r.route_duration_s, r.recurrence_rule, r.status,
      u.id AS driver_id, u.name AS driver_name, u.photo_url AS driver_photo,
      v.model AS vehicle_model, v.registration_no AS vehicle_reg,
      ST_Y(r.origin_pt::geometry) AS origin_lat, ST_X(r.origin_pt::geometry) AS origin_lng,
      ST_Y(r.dest_pt::geometry)   AS dest_lat,   ST_X(r.dest_pt::geometry)   AS dest_lng,
      ST_LineLocatePoint(r.route_geom::geometry, p.pickup_pt::geometry) AS pickup_frac,
      ST_LineLocatePoint(r.route_geom::geometry, p.drop_pt::geometry)   AS drop_frac
    FROM rides r
    CROSS JOIN passenger p
    JOIN users u    ON u.id = r.driver_id
    JOIN vehicles v ON v.id = r.vehicle_id
    WHERE r.org_id = ${orgId}
      AND r.status = 'published'
      AND r.seats_available >= ${q.seats}
      AND r.departure_at BETWEEN ${from} AND ${to}
      AND r.driver_id <> ${userId}
      AND r.route_geom IS NOT NULL
      -- Step 1: both ends near the driver's actual road corridor (GiST).
      AND ST_DWithin(r.route_geom, p.pickup_pt, ${radius})
      AND ST_DWithin(r.route_geom, p.drop_pt,   ${radius})
      -- Step 2: pickup must come before drop along the route.
      AND ST_LineLocatePoint(r.route_geom::geometry, p.pickup_pt::geometry)
        < ST_LineLocatePoint(r.route_geom::geometry, p.drop_pt::geometry)
    ORDER BY r.departure_at ASC
    LIMIT 15
  `;

  if (rows.length === 0) return [];

  const passengerPickup = { lat: q.fromLat!, lng: q.fromLng! };
  const passengerDrop = { lat: q.toLat!, lng: q.toLng! };
  const anchorTime = (q.date ?? new Date()).getTime();

  // Step 3: real detour per candidate. Failures degrade to "no detour figure"
  // rather than dropping the ride — a match with an unknown detour still
  // beats no match at all.
  const scored = await Promise.all(
    rows.map(async (r) => {
      let detourMinutes: number | null = null;
      try {
        const via = await routeVia(
          { lat: r.origin_lat, lng: r.origin_lng },
          passengerPickup,
          passengerDrop,
          { lat: r.dest_lat, lng: r.dest_lng },
        );
        if (r.route_duration_s != null) {
          detourMinutes = Math.max(0, Math.round((via.durationS - r.route_duration_s) / 60));
        }
      } catch {
        detourMinutes = null;
      }
      return { row: r, detourMinutes };
    }),
  );

  const maxDetour = config.MAX_DETOUR_MIN;

  return scored
    .filter((s) => s.detourMinutes === null || s.detourMinutes <= maxDetour)
    .map((s) => {
      // Weighted score, lower is better: detour dominates, departure drift
      // matters next, fare breaks the tie. Passengers feel added travel time
      // far more sharply than a few rupees.
      const detourPenalty = (s.detourMinutes ?? maxDetour) * 2;
      const timeDriftMin = Math.abs(s.row.departure_at.getTime() - anchorTime) / 60_000;
      const score = detourPenalty + timeDriftMin * 0.5 + Number(s.row.fare_per_seat) * 0.05;
      return toSummary(s.row, s.detourMinutes, Math.round(score * 100) / 100);
    })
    .sort((a, b) => (a.matchScore ?? 0) - (b.matchScore ?? 0));
}

export async function getById(rideId: string, orgId: string) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: {
      driver: { select: { id: true, name: true, photoUrl: true, phone: true } },
      vehicle: { select: { model: true, registrationNo: true, color: true } },
      bookings: {
        where: { status: 'booked' },
        include: { passenger: { select: { id: true, name: true, photoUrl: true, phone: true } } },
      },
      trip: true,
    },
  });
  if (!ride || ride.orgId !== orgId) throw notFound('Ride not found');
  return ride;
}

/**
 * Driver pulls a ride that has not departed yet. The only way to close an
 * unwanted "published" ride and free the driver up to publish another one —
 * see the one-active-ride check in publish() above.
 */
export async function cancel(
  rideId: string,
  driverId: string,
  orgId: string,
): Promise<{ passengerIds: string[] }> {
  return prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findUnique({
      where: { id: rideId },
      include: { bookings: { where: { status: 'booked' }, select: { passengerId: true } } },
    });
    if (!ride || ride.orgId !== orgId) throw notFound('Ride not found');
    if (ride.driverId !== driverId) throw forbidden('You can only cancel your own ride');
    if (ride.status === 'cancelled') throw conflict('That ride is already cancelled');
    if (ride.status !== 'published') {
      throw conflict('This ride has already started and can no longer be cancelled');
    }

    await tx.ride.update({ where: { id: rideId }, data: { status: 'cancelled' } });
    await tx.booking.updateMany({
      where: { rideId, status: 'booked' },
      data: { status: 'cancelled' },
    });

    return { passengerIds: ride.bookings.map((b) => b.passengerId) };
  });
}

/** Route geometry for drawing a published ride on the map. */
export async function getRouteGeometry(rideId: string, orgId: string) {
  const rows = await prisma.$queryRaw<{ geojson: string }[]>`
    SELECT ST_AsGeoJSON(route_geom::geometry) AS geojson
    FROM rides
    WHERE id = ${rideId} AND org_id = ${orgId}
  `;
  if (!rows.length || !rows[0].geojson) throw notFound('Route not found for that ride');
  return JSON.parse(rows[0].geojson) as { type: 'LineString'; coordinates: [number, number][] };
}
