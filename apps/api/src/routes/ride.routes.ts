import { Router } from 'express';
import { z } from 'zod';
import { rideCreateSchema, rideSearchSchema, bookingCreateSchema, fareSuggestSchema } from '@syncroute/shared';
import { validateBody, validateQuery, validateParams } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, auth } from '../middleware/auth.js';
import * as rides from '../services/ride.service.js';
import * as bookings from '../services/booking.service.js';
import { emitToTrip, notify } from '../realtime/io.js';

const idParam = z.object({ id: z.string().uuid('Invalid ride id') });

export const rideRoutes = Router();
rideRoutes.use(requireAuth);

/** Offer Ride form: prefill the fare field before publishing. */
rideRoutes.get(
  '/fare-suggestion',
  validateQuery(fareSuggestSchema),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { distanceM: number; vehicleId: string; seatsTotal: number };
    const { orgId } = auth(req);
    res.json(await rides.suggestFareForVehicle(orgId, q.vehicleId, q.distanceM, q.seatsTotal));
  }),
);

rideRoutes.get(
  '/search',
  validateQuery(rideSearchSchema),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    res.json(await rides.search(orgId, sub, req.query as never));
  }),
);

rideRoutes.post(
  '/',
  validateBody(rideCreateSchema),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    res.status(201).json(await rides.publish(sub, orgId, req.body));
  }),
);

rideRoutes.get(
  '/:id',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    res.json(await rides.getById(req.params.id, auth(req).orgId));
  }),
);

rideRoutes.get(
  '/:id/route',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    res.json(await rides.getRouteGeometry(req.params.id, auth(req).orgId));
  }),
);

/** Driver pulls a ride that has not departed — the way to free up their one
 *  active-ride slot without waiting for a trip that will never fill. */
rideRoutes.post(
  '/:id/cancel',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    const result = await rides.cancel(req.params.id, sub, orgId);

    res.json({ ok: true });

    for (const passengerId of result.passengerIds) {
      notify(passengerId, {
        kind: 'booking_cancelled',
        title: 'Ride cancelled',
        body: 'The driver cancelled this ride. Your seat has been released and you have not been charged.',
        rideId: req.params.id,
      });
    }
  }),
);

rideRoutes.post(
  '/:id/book',
  validateParams(idParam),
  validateBody(bookingCreateSchema),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    const booking = await bookings.create(req.params.id, sub, orgId, req.body);

    // Respond first: the passenger's confirmation must not wait on, or fail
    // because of, the driver's notification.
    res.status(201).json(booking);

    notify(booking.driverId, {
      kind: 'booking_created',
      title: 'New booking',
      body:
        `${booking.passengerName} booked ${req.body.seats} seat` +
        `${req.body.seats > 1 ? 's' : ''} · ${req.body.pickup.label} → ${req.body.drop.label}`,
      rideId: req.params.id,
    });
  }),
);

// --- bookings ------------------------------------------------------------

export const bookingRoutes = Router();
bookingRoutes.use(requireAuth);

bookingRoutes.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    res.json(await bookings.listMine(sub, orgId));
  }),
);

bookingRoutes.post(
  '/:id/cancel',
  validateParams(z.object({ id: z.string().uuid('Invalid booking id') })),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    const result = await bookings.cancel(req.params.id, sub, orgId);

    // Tell the driver live — the seat coming back is a demo beat, and a
    // driver who has left for the pickup point needs to know immediately.
    const trip = await rides.getById(result.rideId, orgId);
    if (trip.trip) {
      emitToTrip(trip.trip.id, 'trip:status', {
        tripId: trip.trip.id,
        status: trip.trip.status,
        seatsAvailable: result.seatsAvailable,
        message: 'A passenger cancelled their booking',
      });
    }

    // The trip room only reaches a driver with a trip screen open. This
    // reaches them wherever they are, which is the whole point of a cancellation.
    notify(result.driverId, {
      kind: 'booking_cancelled',
      title: 'Booking cancelled',
      body: `${result.passengerName} cancelled. ${result.seatsAvailable} seat(s) now available.`,
      rideId: result.rideId,
    });

    res.json({ ok: true, seatsAvailable: result.seatsAvailable });
  }),
);
