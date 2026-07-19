import { Router } from 'express';
import { loginSchema, registerSchema, refreshSchema, updateProfileSchema, uploadPhotoSchema } from '@syncroute/shared';
import { saveProfilePhoto } from '../services/photo.service.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, auth } from '../middleware/auth.js';
import * as authService from '../services/auth.service.js';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';

export const authRoutes = Router();

authRoutes.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await authService.register(req.body));
  }),
);

authRoutes.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    res.json(await authService.login(req.body));
  }),
);

authRoutes.post(
  '/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    res.json(await authService.refresh(req.body.refreshToken));
  }),
);

authRoutes.post(
  '/logout',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    res.status(204).end();
  }),
);

// --- /me ------------------------------------------------------------------

export const meRoutes = Router();
meRoutes.use(requireAuth);

meRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const { sub } = auth(req);
    const user = await prisma.user.findUnique({
      where: { id: sub },
      include: { org: { select: { id: true, name: true, code: true, city: true } } },
    });
    if (!user) throw notFound('Account no longer exists');
    res.json({ ...authService.toPublicUser(user), org: user.org });
  }),
);

meRoutes.put(
  '/',
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const { sub } = auth(req);
    // Self-only: the id comes from the token, so one employee can never edit
    // another's profile regardless of what they put in the body.
    const user = await prisma.user.update({ where: { id: sub }, data: req.body });
    res.json(authService.toPublicUser(user));
  }),
);

/**
 * Profile photo upload. Separate from PUT /me because the payload is orders of
 * magnitude larger than the rest of the profile and has its own size limit.
 */
meRoutes.post(
  '/photo',
  validateBody(uploadPhotoSchema),
  asyncHandler(async (req, res) => {
    const { sub } = auth(req);
    const photoUrl = await saveProfilePhoto(sub, req.body.photo);
    const user = await prisma.user.findUnique({ where: { id: sub } });
    res.json({ ...authService.toPublicUser(user!), photoUrl });
  }),
);
