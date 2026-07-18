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
 */
export async function create(
  rideId: string,
  passengerId: string,
  orgId: string,
  input: BookingCreateInput,
): Promise<{ id: string; fareTotal: number; seatsRemaining: number }> {
  return prisma.$transaction(
    async (tx) => {
      // Block if the passenger already has an active booking on an ongoing ride.
      const activeBooking = await tx.booking.findFirst({
        where: {
          passengerId,
          status: 'booked',
          ride: { status: { in: ['published', 'started'] } },
        },
        select: { id: true },
      });
      if (activeBooking) throw conflict('You already have an active ride booking. Complete or cancel it before booking another.');

      // Block if the passenger is also a driver with an active ride.
      const activeDriverRide = await tx.ride.findFirst({
        where: { driverId: passengerId, status: { in: ['published', 'started'] } },
        select: { id: true },
      });
      if (activeDriverRide) throw conflict('You have an active ride as a driver. Complete or cancel it before booking as a passenger.');

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

      // Org check inside the lock, so it cannot be raced either.
      if (ride.org_id !== orgId) throw notFound('Ride not found');
      if (ride.driver_id === passengerId) throw badRequest('You cannot book a seat on your own ride');
      if (ride.status !== 'published') {
        throw conflict(
          ride.status === 'cancelled'
            ? 'That ride has been cancelled'
            : 'That ride has already departed',
        );
      }
      if (ride.departure_at.getTime() < Date.now()) {
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

      const existing = await tx.booking.findUnique({
        where: { rideId_passengerId: { rideId, passengerId } },
      });
      if (existing && existing.status === 'booked') {
        throw conflict('You have already booked this ride');
      }

      const fareTotal = bookingFare(Number(ride.fare_per_seat), input.seats);

      // Decrement inside the same transaction as the insert. Either both land
      // or neither does.
      await tx.$executeRaw`
        UPDATE rides
        SET seats_available = seats_available - ${input.seats}
        WHERE id = ${rideId}
      `;

      // Re-booking after a cancellation reuses the row, since
      // UNIQUE(ride_id, passenger_id) would otherwise reject the insert.
      if (existing) {
        await tx.$executeRaw`
          UPDATE bookings
          SET status = 'booked',
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
          seatsRemaining: ride.seats_available - input.seats,
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
          ${new Prisma.Decimal(fareTotal)}, 'booked', NOW()
        )
        RETURNING id
      `;

      return {
        id: inserted[0].id,
        fareTotal,
        seatsRemaining: ride.seats_available - input.seats,
      };
    },
    // Serializable would also be correct, but the explicit row lock gives the
    // same guarantee here without retry-on-serialization-failure handling.
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
  );
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
): Promise<{ rideId: string; seatsAvailable: number; driverId: string }> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { ride: { include: { trip: true } } },
    });
    if (!booking || booking.orgId !== orgId) throw notFound('Booking not found');
    if (booking.passengerId !== userId) {
      throw forbidden('You can only cancel your own bookings');
    }
    if (booking.status === 'cancelled') throw conflict('That booking is already cancelled');
    if (booking.status === 'completed') throw conflict('That trip is already complete');

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
