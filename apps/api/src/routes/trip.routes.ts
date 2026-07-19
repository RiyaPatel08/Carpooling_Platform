import { Router } from 'express';
import { z } from 'zod';
import { SOCKET_EVENTS } from '@syncroute/shared';
import { validateParams } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, auth } from '../middleware/auth.js';
import * as trips from '../services/trip.service.js';
import * as simulation from '../services/simulation.service.js';
import { trackHistory } from '../services/tracking.service.js';
import { prisma } from '../db.js';
import { emitToTrip, notify } from '../realtime/io.js';

const idParam = z.object({ id: z.string().uuid('Invalid trip id') });

export const tripRoutes = Router();
tripRoutes.use(requireAuth);

tripRoutes.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    res.json(await trips.listMine(sub, orgId));
  }),
);

/** Ride History screen. */
tripRoutes.get(
  '/history',
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    res.json(await trips.history(sub, orgId));
  }),
);

tripRoutes.post(
  '/:id/start',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    const trip = await trips.start(req.params.id, sub, orgId);
    emitToTrip(trip.id, SOCKET_EVENTS.tripStatus, {
      tripId: trip.id,
      status: trip.status,
      message: 'Your driver has started the trip',
    });

    // Passengers only — the driver just pressed the button and does not need
    // telling. They may be anywhere in the app, hence the user rooms.
    notify(
      (await trips.participantIds(trip.id)).filter((id) => id !== sub),
      {
        kind: 'trip_started',
        title: 'Your trip has started',
        body: 'Your driver is on the way. Tap to track the vehicle live.',
        tripId: trip.id,
      },
    );
    res.json(trip);
  }),
);

tripRoutes.post(
  '/:id/complete',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    // Participants must be read BEFORE completing: the trigger locks the trip
    // row in a terminal state, and cancelled bookings are excluded either way.
    const participants = await trips.participantIds(req.params.id);
    const trip = await trips.complete(req.params.id, sub, orgId);
    emitToTrip(trip.id, SOCKET_EVENTS.tripStatus, {
      tripId: trip.id,
      status: trip.status,
      message: 'Trip complete — payment pending',
    });

    notify(participants.filter((id) => id !== sub), {
      kind: 'trip_completed',
      title: 'Trip complete',
      body: 'Your ride has ended. Tap to pay your share.',
      tripId: trip.id,
    });
    res.json(trip);
  }),
);

/**
 * Demo simulation. Replays the ride's real route through the production
 * ping path so tracking can be shown without depending on venue GPS.
 */
tripRoutes.post(
  '/:id/simulate',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    const deviate = req.body?.deviate === true;
    const result = await simulation.start(req.params.id, sub, orgId, {
      deviate,
      speedFactor: Number(req.body?.speedFactor) || 1,
    });
    res.status(202).json({ ok: true, ...result });
  }),
);

tripRoutes.post(
  '/:id/simulate/stop',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    // Authorisation lives in the service; stopping is driver-only too.
    await trips.assertParticipant(req.params.id, sub);
    res.json({ ok: simulation.stop(req.params.id) });
  }),
);

/** Chat history. The live stream is on the socket; this backfills on open. */
tripRoutes.get(
  '/:id/messages',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const { sub } = auth(req);
    await trips.assertParticipant(req.params.id, sub);
    const rows = await prisma.message.findMany({
      where: { tripId: req.params.id },
      include: { sender: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    res.json(
      rows.map((m) => ({
        id: m.id,
        tripId: m.tripId,
        senderId: m.senderId,
        senderName: m.sender.name,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    );
  }),
);

/** Recorded path so Track Ride can draw where the vehicle has already been. */
tripRoutes.get(
  '/:id/track',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const { sub } = auth(req);
    await trips.assertParticipant(req.params.id, sub);
    const points = await trackHistory(req.params.id);
    res.json(
      points.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        speed: p.speed,
        recordedAt: p.recorded_at.toISOString(),
      })),
    );
  }),
);
