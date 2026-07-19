import type { TripStatus } from '@syncroute/shared';
import { TRIP_TRANSITIONS } from '@syncroute/shared';
import { prisma } from '../db.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';

/**
 * Service-layer half of the trip state machine. The database trigger is the
 * other half: this gives callers a clear message, the trigger guarantees the
 * rule even if this code is bypassed.
 */
export function assertTransition(from: TripStatus, to: TripStatus): void {
  const allowed = TRIP_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw conflict(
      allowed.length === 0
        ? `This trip is complete and cannot change state`
        : `A trip cannot go from "${from}" to "${to}" (expected: ${allowed.join(' or ')})`,
      'ILLEGAL_TRANSITION',
    );
  }
}

async function loadTripForDriver(tripId: string, userId: string, orgId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { ride: true },
  });
  if (!trip || trip.ride.orgId !== orgId) throw notFound('Trip not found');
  if (trip.ride.driverId !== userId) {
    throw forbidden('Only the driver can change the status of this trip');
  }
  return trip;
}

/** Driver taps Start. Locks the ride so no one can still be booking into it. */
export async function start(tripId: string, userId: string, orgId: string) {
  const trip = await loadTripForDriver(tripId, userId, orgId);
  assertTransition(trip.status, 'started');

  const bookings = await prisma.booking.count({
    where: { rideId: trip.rideId, status: 'booked' },
  });
  if (bookings === 0) {
    throw conflict('Nobody has booked this ride yet');
  }

  return prisma.$transaction(async (tx) => {
    await tx.ride.update({ where: { id: trip.rideId }, data: { status: 'started' } });
    return tx.trip.update({
      where: { id: tripId },
      data: { status: 'started', startedAt: new Date() },
    });
  });
}

/** First GPS ping moves started -> in_progress; called by the socket handler. */
export async function markInProgress(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.status !== 'started') return trip;
  return prisma.trip.update({ where: { id: tripId }, data: { status: 'in_progress' } });
}

/**
 * Driver taps Complete. This is the point of no return: after it, the trigger
 * refuses to let the trip row change except along the payment path.
 */
export async function complete(tripId: string, userId: string, orgId: string) {
  const trip = await loadTripForDriver(tripId, userId, orgId);

  // Allow completing from 'started' too — a trip whose GPS never reported
  // (venue network dies) must still be completable.
  if (trip.status === 'started') {
    await prisma.trip.update({ where: { id: tripId }, data: { status: 'in_progress' } });
    trip.status = 'in_progress';
  }
  assertTransition(trip.status, 'completed');

  return prisma.$transaction(async (tx) => {
    await tx.ride.update({ where: { id: trip.rideId }, data: { status: 'completed' } });
    await tx.booking.updateMany({
      where: { rideId: trip.rideId, status: 'booked' },
      data: { status: 'completed' },
    });
    const completed = await tx.trip.update({
      where: { id: tripId },
      data: { status: 'completed', completedAt: new Date() },
    });
    // Straight into payment_pending: the mockup takes the passenger to the
    // Trip Finish / Pay Now screen the moment the trip ends.
    return tx.trip.update({ where: { id: tripId }, data: { status: 'payment_pending' } });
  });
}

/** My Trips — everything the user is in, as driver or passenger. */
export async function listMine(userId: string, orgId: string) {
  const rides = await prisma.ride.findMany({
    where: {
      orgId,
      OR: [{ driverId: userId }, { bookings: { some: { passengerId: userId, status: { not: 'cancelled' } } } }],
    },
    include: {
      driver: { select: { id: true, name: true, photoUrl: true, phone: true } },
      vehicle: { select: { model: true, registrationNo: true } },
      trip: true,
      bookings: {
        where: { status: { not: 'cancelled' } },
        include: { passenger: { select: { id: true, name: true, photoUrl: true, phone: true } } },
      },
    },
    orderBy: { departureAt: 'desc' },
  });

  return rides.map((r) => ({
    rideId: r.id,
    tripId: r.trip?.id ?? null,
    role: r.driverId === userId ? ('driver' as const) : ('passenger' as const),
    status: r.trip?.status ?? 'booked',
    rideStatus: r.status,
    originLabel: r.originLabel,
    destLabel: r.destLabel,
    departureAt: r.departureAt.toISOString(),
    farePerSeat: Number(r.farePerSeat),
    driver: r.driver,
    vehicle: r.vehicle,
    seatsTotal: r.seatsTotal,
    seatsAvailable: r.seatsAvailable,
    // A driver sees their passenger list; a passenger sees only their own row.
    bookings: r.bookings
      .filter((b) => r.driverId === userId || b.passengerId === userId)
      .map((b) => ({
        id: b.id,
        passenger: b.passenger,
        seats: b.seats,
        pickupLabel: b.pickupLabel,
        dropLabel: b.dropLabel,
        fareTotal: Number(b.fareTotal),
        status: b.status,
      })),
  }));
}

/** Ride History — completed trips only. */
export async function history(userId: string, orgId: string) {
  const all = await listMine(userId, orgId);
  return all.filter((t) => ['completed', 'payment_pending', 'payment_completed'].includes(t.status));
}

async function loadParticipants(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      ride: {
        select: {
          id: true,
          driverId: true,
          bookings: { where: { status: { not: 'cancelled' } }, select: { passengerId: true } },
        },
      },
    },
  });
  if (!trip) throw notFound('Trip not found');
  return trip;
}

/** Participants of a trip — used to authorise socket joins and chat. */
export async function assertParticipant(tripId: string, userId: string): Promise<{ rideId: string }> {
  const trip = await loadParticipants(tripId);

  const isDriver = trip.ride.driverId === userId;
  const isPassenger = trip.ride.bookings.some((b) => b.passengerId === userId);
  // Live location is shared only with people actually on the ride.
  if (!isDriver && !isPassenger) throw forbidden('You are not part of this trip');

  return { rideId: trip.ride.id };
}

/** Everyone on a trip: the driver plus every passenger still booked. */
export async function participantIds(tripId: string): Promise<string[]> {
  const trip = await loadParticipants(tripId);
  return [trip.ride.driverId, ...trip.ride.bookings.map((b) => b.passengerId)];
}
