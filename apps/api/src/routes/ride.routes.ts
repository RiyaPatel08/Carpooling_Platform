import { Router } from 'express';
import { z } from 'zod';
import { rideCreateSchema, rideSearchSchema, bookingCreateSchema, fareSuggestSchema } from '@syncroute/shared';
import { validateBody, validateQuery, validateParams } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, auth } from '../middleware/auth.js';
import * as rides from '../services/ride.service.js';
import * as bookings from '../services/booking.service.js';
import { emitToTrip } from '../realtime/io.js';

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

rideRoutes.post(
  '/:id/book',
  validateParams(idParam),
  validateBody(bookingCreateSchema),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    res.status(201).json(await bookings.create(req.params.id, sub, orgId, req.body));
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

    res.json({ ok: true, seatsAvailable: result.seatsAvailable });
  }),
);
