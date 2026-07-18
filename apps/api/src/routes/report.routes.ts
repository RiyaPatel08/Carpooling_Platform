import { Router } from 'express';
import { reportQuerySchema } from '@syncroute/shared';
import { validateQuery } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, auth } from '../middleware/auth.js';
import * as reports from '../services/report.service.js';

export const reportRoutes = Router();
// Reports are org-wide but not admin-only: the mockup gives employees a
// Reports screen too. Org scoping still comes from the token.
reportRoutes.use(requireAuth);

reportRoutes.get(
  '/summary',
  validateQuery(reportQuerySchema),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as unknown as { from?: Date; to?: Date };
    res.json(await reports.summary(auth(req).orgId, { from, to }));
  }),
);

reportRoutes.get(
  '/vehicles',
  validateQuery(reportQuerySchema),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as unknown as { from?: Date; to?: Date };
    res.json(await reports.byVehicle(auth(req).orgId, { from, to }));
  }),
);

reportRoutes.get(
  '/monthly',
  asyncHandler(async (req, res) => {
    res.json(await reports.monthly(auth(req).orgId));
  }),
);
