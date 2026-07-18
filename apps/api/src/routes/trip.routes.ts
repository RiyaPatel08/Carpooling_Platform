import { Router } from 'express';
import { z } from 'zod';
import { SOCKET_EVENTS } from '@syncroute/shared';
import { validateParams } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, auth } from '../middleware/auth.js';
import * as trips from '../services/trip.service.js';
import { trackHistory } from '../services/tracking.service.js';
import { prisma } from '../db.js';
import { emitToTrip } from '../realtime/io.js';

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
    res.json(trip);
  }),
);

tripRoutes.post(
  '/:id/complete',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    const trip = await trips.complete(req.params.id, sub, orgId);
    emitToTrip(trip.id, SOCKET_EVENTS.tripStatus, {
      tripId: trip.id,
      status: trip.status,
      message: 'Trip complete — payment pending',
    });
    res.json(trip);
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
