import { Router } from 'express';
import { z } from 'zod';
import { vehicleCreateSchema, vehicleUpdateSchema } from '@syncroute/shared';
import { validateBody, validateParams } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, auth } from '../middleware/auth.js';
import * as vehicles from '../services/vehicle.service.js';

const idParam = z.object({ id: z.string().uuid('Invalid vehicle id') });

export const vehicleRoutes = Router();
vehicleRoutes.use(requireAuth);

vehicleRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await vehicles.listMine(auth(req).sub));
  }),
);

vehicleRoutes.post(
  '/',
  validateBody(vehicleCreateSchema),
  asyncHandler(async (req, res) => {
    const { sub, orgId } = auth(req);
    res.status(201).json(await vehicles.create(sub, orgId, req.body));
  }),
);

vehicleRoutes.put(
  '/:id',
  validateParams(idParam),
  validateBody(vehicleUpdateSchema),
  asyncHandler(async (req, res) => {
    res.json(await vehicles.update(req.params.id, auth(req).sub, req.body));
  }),
);

vehicleRoutes.delete(
  '/:id',
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    await vehicles.remove(req.params.id, auth(req).sub);
    res.status(204).end();
  }),
);
