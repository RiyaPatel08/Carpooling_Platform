import { Prisma } from '@prisma/client';
import type { BookingCreateInput } from '@syncroute/shared';
import { prisma } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { pointWkt } from '../lib/geo.js';
import { bookingFare } from './fare.service.js';

/**
 * Book seats on a ride.
 *
 * The whole thing is one transaction, and it opens by taking a row lock on
 * the ride with SELECT ... FOR UPDATE. Two passengers racing for the last
 * seat serialise here: the second one blocks until the first commits, then
 * re-reads seats_available as 0 and is rejected. Reading seats first and
 * updating after -- the obvious implementation -- oversells the car, because
 * both transactions read "1 available" before either writes.
 *
 * The CHECK constraint on seats_available is the backstop if this is ever
 * refactored wrongly.
 *
 * A ride already 'started' can still be joined — the mid-trip pickup case:
 * a passenger further along the corridor than the original booking window,
 * matched because the driver has not yet passed their pickup point. That
 * case does not hold a seat immediately; it lands as 'requested' and waits
 * for the driver's accept/decline (see respond() below), because the driver
 * is already committed to the road and gets a say in who still joins.
 */
export async function create(
  rideId: string,
  passengerId: string,
  orgId: string,
  input: BookingCreateInput,
): Promise<{
  id: string;
  fareTotal: number;
  seatsRemaining: number;
  /** Who to tell about this booking. */
  driverId: string;
  passengerName: string;
  /** True for a mid-trip join awaiting the driver's decision — no seat is
   *  held yet, and there is nothing to pay until it is accepted. */
  pending: boolean;
}> {
  return prisma.$transaction(
    async (tx) => {
      // FOR UPDATE: serialises concurrent bookings on this ride.
      const locked = await tx.$queryRaw<
        {
          id: string;
          org_id: string;
          driver_id: string;
          seats_available: number;
          fare_per_seat: Prisma.Decimal;
          status: string;
          departure_at: Date;
        }[]
      >`
        SELECT id, org_id, driver_id, seats_available, fare_per_seat, status, departure_at
        FROM rides
        WHERE id = ${rideId}
        FOR UPDATE
      `;

      if (locked.length === 0) throw notFound('Ride not found');
      const ride = locked[0];
      const isMidTripJoin = ride.status === 'started';

      // Org check inside the lock, so it cannot be raced either.
      if (ride.org_id !== orgId) throw notFound('Ride not found');
      if (ride.driver_id === passengerId) throw badRequest('You cannot book a seat on your own ride');
      if (ride.status !== 'published' && !isMidTripJoin) {
        throw conflict(
          ride.status === 'cancelled'
            ? 'That ride has been cancelled'
            : 'That ride has already ended',
        );
      }
      // A started ride's departure time is naturally in the past — that
      // check only makes sense for one still waiting to leave.
      if (!isMidTripJoin && ride.departure_at.getTime() < Date.now()) {
        throw conflict('That ride has already departed');
      }

      if (ride.seats_available < input.seats) {
        throw conflict(
          ride.seats_available === 0
            ? 'Sorry, this ride is now full'
            : `Only ${ride.seats_available} seat(s) left on this ride`,
          'NO_SEATS',
        );
      }

      const [existing, passenger] = await Promise.all([
        tx.booking.findUnique({ where: { rideId_passengerId: { rideId, passengerId } } }),
        tx.user.findUnique({ where: { id: passengerId }, select: { name: true } }),
      ]);
      if (existing && (existing.status === 'booked' || existing.status === 'requested')) {
        throw conflict(
          existing.status === 'booked'
            ? 'You have already booked this ride'
            : 'You already asked to join this ride — wait for the driver to respond',
        );
      }

      // One active booking (or pending request) at a time: a passenger
      // already riding, or waiting on a decision, cannot also book or
      // request a second ride. chk_one_active_booking_per_passenger backs
      // the 'booked' half of this at the database level.
      const activeElsewhere = await tx.booking.findFirst({
        where: { passengerId, status: { in: ['booked', 'requested'] }, rideId: { not: rideId } },
      });
      if (activeElsewhere) {
        throw conflict(
          'You already have an active booking. Cancel it or wait for it to finish before booking another ride.',
          'ACTIVE_BOOKING_EXISTS',
        );
      }

      // A driver mid-carpool cannot also book a seat as a passenger on
      // someone else's ride — same one-thing-at-a-time rule, other direction.
      const activeAsDriver = await tx.ride.findFirst({
        where: { driverId: passengerId, status: { in: ['published', 'started'] } },
        select: { id: true },
      });
      if (activeAsDriver) {
        throw conflict(
          'You have an active ride as a driver. Complete or cancel it before booking as a passenger.',
          'ACTIVE_RIDE_EXISTS',
        );
      }

      // How much of the driver's route this passenger actually occupies.
      // ST_LineLocatePoint projects each end onto the route and returns its
      // position as a 0..1 fraction of the line, so the difference is the
      // share of the journey being sold. A ride published before route_geom
      // was stored yields no row and falls back to the full fare.
      const [seg] = await tx.$queryRaw<{ pickup_frac: number | null; drop_frac: number | null }[]>`
        SELECT
          ST_LineLocatePoint(r.route_geom::geometry, ST_GeogFromText(${pointWkt(input.pickup.lat, input.pickup.lng)})::geometry) AS pickup_frac,
          ST_LineLocatePoint(r.route_geom::geometry, ST_GeogFromText(${pointWkt(input.drop.lat, input.drop.lng)})::geometry) AS drop_frac
        FROM rides r
        WHERE r.id = ${rideId} AND r.route_geom IS NOT NULL
      `;
      const fraction =
        seg?.pickup_frac != null && seg?.drop_frac != null
          ? Math.max(seg.drop_frac - seg.pickup_frac, 0)
          : 1;

      if (isMidTripJoin && seg?.pickup_frac != null) {
        // The driver's most recent ping projected onto the same route — no
        // ping yet (GPS hasn't reported) means the driver is still
        // effectively at the start, so the ride stays fully joinable.
        const [driverPos] = await tx.$queryRaw<{ driver_frac: number | null }[]>`
          SELECT ST_LineLocatePoint(r.route_geom::geometry, tl.pt::geometry) AS driver_frac
          FROM rides r
          JOIN trips t ON t.ride_id = r.id
          JOIN trip_locations tl ON tl.trip_id = t.id
          WHERE r.id = ${rideId}
          ORDER BY tl.recorded_at DESC
          LIMIT 1
        `;
        if (driverPos?.driver_frac != null && driverPos.driver_frac > seg.pickup_frac) {
          throw conflict(
            'The driver has already passed your pickup point on this route',
            'ALREADY_PASSED',
          );
        }
      }

      const fareTotal = bookingFare(Number(ride.fare_per_seat), input.seats, fraction);
      const status = isMidTripJoin ? 'requested' : 'booked';

      // A mid-trip request does not hold a seat until the driver accepts —
      // see respond() — so only an instant booking decrements here.
      if (!isMidTripJoin) {
        await tx.$executeRaw`
          UPDATE rides
          SET seats_available = seats_available - ${input.seats}
          WHERE id = ${rideId}
        `;
      }

      // Re-booking after a cancellation/decline reuses the row, since
      // UNIQUE(ride_id, passenger_id) would otherwise reject the insert.
      if (existing) {
        await tx.$executeRaw`
          UPDATE bookings
          SET status = ${status}::"BookingStatus",
              seats = ${input.seats},
              pickup_label = ${input.pickup.label},
              drop_label = ${input.drop.label},
              pickup_pt = ST_GeogFromText(${pointWkt(input.pickup.lat, input.pickup.lng)}),
              drop_pt   = ST_GeogFromText(${pointWkt(input.drop.lat, input.drop.lng)}),
              fare_total = ${new Prisma.Decimal(fareTotal)},
              created_at = NOW()
          WHERE id = ${existing.id}
        `;
        return {
          id: existing.id,
          fareTotal,
          seatsRemaining: isMidTripJoin ? ride.seats_available : ride.seats_available - input.seats,
          driverId: ride.driver_id,
          passengerName: passenger?.name ?? 'A colleague',
          pending: isMidTripJoin,
        };
      }

      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO bookings (
          id, org_id, ride_id, passenger_id, seats,
          pickup_label, drop_label, pickup_pt, drop_pt,
          fare_total, status, created_at
        ) VALUES (
          gen_random_uuid()::text, ${orgId}, ${rideId}, ${passengerId}, ${input.seats},
          ${input.pickup.label}, ${input.drop.label},
          ST_GeogFromText(${pointWkt(input.pickup.lat, input.pickup.lng)}),
          ST_GeogFromText(${pointWkt(input.drop.lat, input.drop.lng)}),
          ${new Prisma.Decimal(fareTotal)}, ${status}::"BookingStatus", NOW()
        )
        RETURNING id
      `;

      return {
        id: inserted[0].id,
        fareTotal,
        seatsRemaining: isMidTripJoin ? ride.seats_available : ride.seats_available - input.seats,
        driverId: ride.driver_id,
        passengerName: passenger?.name ?? 'A colleague',
        pending: isMidTripJoin,
      };
    },
    // Serializable would also be correct, but the explicit row lock gives the
    // same guarantee here without retry-on-serialization-failure handling.
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
  );
}

/**
 * Driver accepts or declines a mid-trip join request.
 *
 * Accepting re-checks seats under the same row lock discipline as create():
 * availability may have moved between the request landing and the driver
 * responding, so this is not just a status flip.
 */
export async function respond(
  bookingId: string,
  driverId: string,
  orgId: string,
  accept: boolean,
): Promise<{
  rideId: string;
  passengerId: string;
  passengerName: string;
  seatsAvailable: number;
  accepted: boolean;
}> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { ride: true, passenger: { select: { id: true, name: true } } },
    });
    if (!booking || booking.orgId !== orgId) throw notFound('Request not found');
    if (booking.ride.driverId !== driverId) {
      throw forbidden('You can only respond to requests on your own ride');
    }
    if (booking.status !== 'requested') throw conflict('That request has already been resolved');

    if (!accept) {
      await tx.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } });
      return {
        rideId: booking.rideId,
        passengerId: booking.passengerId,
        passengerName: booking.passenger.name,
        seatsAvailable: booking.ride.seatsAvailable,
        accepted: false,
      };
    }

    const locked = await tx.$queryRaw<{ seats_available: number }[]>`
      SELECT seats_available FROM rides WHERE id = ${booking.rideId} FOR UPDATE
    `;
    if (!locked.length) throw notFound('Ride not found');
    if (locked[0].seats_available < booking.seats) {
      throw conflict('Not enough seats left to accept this request', 'NO_SEATS');
    }

    await tx.$executeRaw`
      UPDATE rides SET seats_available = seats_available - ${booking.seats} WHERE id = ${booking.rideId}
    `;
    await tx.booking.update({ where: { id: bookingId }, data: { status: 'booked' } });

    return {
      rideId: booking.rideId,
      passengerId: booking.passengerId,
      passengerName: booking.passenger.name,
      seatsAvailable: locked[0].seats_available - booking.seats,
      accepted: true,
    };
  });
}

/**
 * Cancel a booking and hand the seats straight back.
 *
 * Same locking discipline as booking: the release must be atomic with the
 * status change, or two cancellations could each add seats back.
 */
export async function cancel(
  bookingId: string,
  userId: string,
  orgId: string,
): Promise<{
  rideId: string;
  seatsAvailable: number;
  driverId: string;
  passengerName: string;
}> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { ride: { include: { trip: true } }, passenger: { select: { name: true } } },
    });
    if (!booking || booking.orgId !== orgId) throw notFound('Booking not found');
    if (booking.passengerId !== userId) {
      throw forbidden('You can only cancel your own bookings');
    }
    if (booking.status === 'cancelled') throw conflict('That booking is already cancelled');
    if (booking.status === 'completed') throw conflict('That trip is already complete');

    // A still-pending mid-trip request never held a seat, so withdrawing it
    // is a plain status flip — no lock, no give-back.
    if (booking.status === 'requested') {
      await tx.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } });
      return {
        rideId: booking.rideId,
        seatsAvailable: booking.ride.seatsAvailable,
        driverId: booking.ride.driverId,
        passengerName: booking.passenger.name,
      };
    }

    // Once the driver has set off, a seat cannot be given back — they may
    // already have driven to the pickup point.
    const tripStatus = booking.ride.trip?.status;
    if (tripStatus && tripStatus !== 'booked') {
      throw conflict('This trip has already started and can no longer be cancelled');
    }
    if (booking.ride.status !== 'published') {
      throw conflict('This trip has already started and can no longer be cancelled');
    }

    await tx.$queryRaw`SELECT id FROM rides WHERE id = ${booking.rideId} FOR UPDATE`;

    await tx.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } });

    const updated = await tx.$queryRaw<{ seats_available: number }[]>`
      UPDATE rides
      SET seats_available = LEAST(seats_available + ${booking.seats}, seats_total)
      WHERE id = ${booking.rideId}
      RETURNING seats_available
    `;

    return {
      rideId: booking.rideId,
      seatsAvailable: updated[0].seats_available,
      driverId: booking.ride.driverId,
      passengerName: booking.passenger.name,
    };
  });
}

export async function listMine(userId: string, orgId: string) {
  return prisma.booking.findMany({
    where: { passengerId: userId, orgId },
    include: {
      ride: {
        include: {
          driver: { select: { id: true, name: true, photoUrl: true, phone: true } },
          vehicle: { select: { model: true, registrationNo: true } },
          trip: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}
