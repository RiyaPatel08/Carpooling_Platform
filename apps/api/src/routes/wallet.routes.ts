import { Router } from 'express';
import { z } from 'zod';
import { rechargeOrderSchema, rechargeVerifySchema, payBookingSchema, savedPlaceCreateSchema, SOCKET_EVENTS } from '@syncroute/shared';
import { validateBody, validateParams } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, auth } from '../middleware/auth.js';
import * as wallet from '../services/wallet.service.js';
import { prisma } from '../db.js';
import { emitToTrip, notify } from '../realtime/io.js';
import { forbidden, notFound } from '../lib/errors.js';

export const walletRoutes = Router();
walletRoutes.use(requireAuth);

walletRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await wallet.summary(auth(req).sub));
  }),
);

walletRoutes.post(
  '/recharge/order',
  validateBody(rechargeOrderSchema),
  asyncHandler(async (req, res) => {
    res.json(await wallet.createRechargeOrder(auth(req).sub, req.body.amount));
  }),
);

walletRoutes.post(
  '/recharge/verify',
  validateBody(rechargeVerifySchema.extend({ amount: z.coerce.number().positive() })),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    res.json(await wallet.verifyRecharge(sub, orgId, req.body, req.body.amount));
  }),
);

// --- payments -------------------------------------------------------------

export const paymentRoutes = Router();
paymentRoutes.use(requireAuth);

paymentRoutes.post(
  '/:bookingId',
  validateParams(z.object({ bookingId: z.string().uuid('Invalid booking id') })),
  validateBody(payBookingSchema),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    const result = await wallet.payBooking(
      req.params.bookingId,
      sub,
      orgId,
      req.body.method,
      req.body.razorpayPaymentId,
    );

    if (result.tripId) {
      emitToTrip(result.tripId, SOCKET_EVENTS.tripStatus, {
        tripId: result.tripId,
        status: 'payment_completed',
        message: 'Payment received',
      });
    }

    notify(result.driverId, {
      kind: 'payment_received',
      title: 'Fare received',
      body: `₹${result.amount.toFixed(2)} has been credited to your wallet.`,
      tripId: result.tripId,
    });

    res.json(result);
  }),
);

// --- saved places ---------------------------------------------------------

export const savedPlaceRoutes = Router();
savedPlaceRoutes.use(requireAuth);

savedPlaceRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await prisma.savedPlace.findMany({
      where: { userId: auth(req).sub },
      orderBy: { createdAt: 'asc' },
    });
    res.json(rows.map((p) => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) })));
  }),
);

savedPlaceRoutes.post(
  '/',
  validateBody(savedPlaceCreateSchema),
  asyncHandler(async (req, res) => {
    const place = await prisma.savedPlace.create({
      data: { ...req.body, userId: auth(req).sub },
    });
    res.status(201).json({ ...place, lat: Number(place.lat), lng: Number(place.lng) });
  }),
);

savedPlaceRoutes.delete(
  '/:id',
  validateParams(z.object({ id: z.string().uuid('Invalid place id') })),
  asyncHandler(async (req, res) => {
    const place = await prisma.savedPlace.findUnique({ where: { id: req.params.id } });
    if (!place) throw notFound('Saved place not found');
    if (place.userId !== auth(req).sub) throw forbidden('You can only remove your own saved places');
    await prisma.savedPlace.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);
