import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { employeeCreateSchema, employeeUpdateSchema, orgSettingsSchema, vehicleStatusUpdateSchema } from '@syncroute/shared';
import { validateBody, validateParams } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireAdmin, auth } from '../middleware/auth.js';
import { prisma } from '../db.js';
import * as vehicles from '../services/vehicle.service.js';
import { toPublicUser } from '../services/auth.service.js';
import { badRequest, notFound } from '../lib/errors.js';

const idParam = z.object({ id: z.string().uuid('Invalid id') });

export const adminRoutes = Router();
// Every route below is admin-only AND org-scoped. Both guards, always.
adminRoutes.use(requireAuth, requireAdmin);

// --- employees ------------------------------------------------------------

adminRoutes.get(
  '/employees',
  asyncHandler(async (req, res) => {
    const rows = await prisma.user.findMany({
      where: { orgId: auth(req).orgId },
      include: { _count: { select: { vehicles: true, ridesAsDriver: true, bookings: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(
      rows.map((u) => ({
        ...toPublicUser(u),
        manager: u.manager,
        vehicleCount: u._count.vehicles,
        ridesOffered: u._count.ridesAsDriver,
        ridesTaken: u._count.bookings,
      })),
    );
  }),
);

adminRoutes.post(
  '/employees',
  validateBody(employeeCreateSchema),
  asyncHandler(async (req, res) => {
    const { orgId } = auth(req);
    const body = req.body as z.infer<typeof employeeCreateSchema>;

    const existing = await prisma.user.findUnique({
      where: { orgId_email: { orgId, email: body.email } },
    });
    if (existing) throw badRequest('An employee with that email already exists');

    const user = await prisma.user.create({
      data: {
        orgId, // from the token, never the body
        name: body.name,
        email: body.email,
        phone: body.phone,
        passwordHash: await argon2.hash(body.password),
        role: body.role,
        department: body.department ?? null,
        manager: body.manager ?? null,
        location: body.location ?? null,
      },
    });
    res.status(201).json(toPublicUser(user));
  }),
);

adminRoutes.put(
  '/employees/:id',
  validateParams(idParam),
  validateBody(employeeUpdateSchema),
  asyncHandler(async (req, res) => {
    const { orgId, sub } = auth(req);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.orgId !== orgId) throw notFound('Employee not found');

    const body = req.body as z.infer<typeof employeeUpdateSchema>;

    // An admin locking themselves out mid-demo is unrecoverable without DB
    // access, so self-demotion and self-revocation are refused.
    if (target.id === sub) {
      if (body.isActive === false) throw badRequest('You cannot revoke your own access');
      if (body.role && body.role !== 'admin') throw badRequest('You cannot remove your own admin role');
    }

    const updated = await prisma.user.update({ where: { id: req.params.id }, data: body });

    // Revoking access must end existing sessions, not just block new logins.
    if (body.isActive === false) {
      await prisma.refreshToken.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    res.json(toPublicUser(updated));
  }),
);

// --- vehicles -------------------------------------------------------------

adminRoutes.get(
  '/vehicles',
  asyncHandler(async (req, res) => {
    res.json(await vehicles.listForOrg(auth(req).orgId));
  }),
);

adminRoutes.put(
  '/vehicles/:id/status',
  validateParams(idParam),
  validateBody(vehicleStatusUpdateSchema),
  asyncHandler(async (req, res) => {
    const { orgId } = auth(req);
    res.json(await vehicles.setStatus(req.params.id, orgId, req.body.status));
  }),
);

// --- settings -------------------------------------------------------------

adminRoutes.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { id: auth(req).orgId } });
    if (!org) throw notFound('Organization not found');
    res.json({
      ...org,
      fuelCostPerLitre: Number(org.fuelCostPerLitre),
      defaultMileageKmpl: Number(org.defaultMileageKmpl),
      costPerKm: Number(org.costPerKm),
    });
  }),
);

adminRoutes.put(
  '/settings',
  validateBody(orgSettingsSchema),
  asyncHandler(async (req, res) => {
    const org = await prisma.organization.update({
      where: { id: auth(req).orgId },
      data: req.body,
    });
    res.json({
      ...org,
      fuelCostPerLitre: Number(org.fuelCostPerLitre),
      defaultMileageKmpl: Number(org.defaultMileageKmpl),
      costPerKm: Number(org.costPerKm),
    });
  }),
);

// --- safety feed ----------------------------------------------------------

adminRoutes.get(
  '/safety-events',
  asyncHandler(async (req, res) => {
    const rows = await prisma.$queryRaw<
      {
        id: string;
        trip_id: string;
        kind: 'route_deviation' | 'sos';
        detail: string | null;
        lat: number | null;
        lng: number | null;
        created_at: Date;
        ride_id: string;
        origin_label: string;
        dest_label: string;
        driver_name: string;
      }[]
    >`
      SELECT
        se.id, se.trip_id, se.kind, se.detail, se.created_at,
        ST_Y(se.pt::geometry) AS lat, ST_X(se.pt::geometry) AS lng,
        r.id AS ride_id, r.origin_label, r.dest_label, u.name AS driver_name
      FROM safety_events se
      JOIN trips t  ON t.id = se.trip_id
      JOIN rides r  ON r.id = t.ride_id
      JOIN users u  ON u.id = r.driver_id
      WHERE r.org_id = ${auth(req).orgId}::uuid
      ORDER BY se.created_at DESC
      LIMIT 100
    `;

    res.json(
      rows.map((e) => ({
        id: e.id,
        tripId: e.trip_id,
        kind: e.kind,
        detail: e.detail,
        lat: e.lat,
        lng: e.lng,
        createdAt: e.created_at.toISOString(),
        ride: {
          id: e.ride_id,
          originLabel: e.origin_label,
          destLabel: e.dest_label,
          driverName: e.driver_name,
        },
      })),
    );
  }),
);
