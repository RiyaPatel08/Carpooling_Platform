import express from 'express';
import cors from 'cors';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { UPLOAD_DIR } from './services/photo.service.js';
import { authRoutes, meRoutes } from './routes/auth.routes.js';
import { geoRoutes } from './routes/geo.routes.js';
import { vehicleRoutes } from './routes/vehicle.routes.js';
import { rideRoutes, bookingRoutes } from './routes/ride.routes.js';
import { tripRoutes } from './routes/trip.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { reportRoutes } from './routes/report.routes.js';
import { walletRoutes, paymentRoutes, savedPlaceRoutes } from './routes/wallet.routes.js';

export function createApp() {
  const app = express();

  app.use(cors());
  // 2mb: a base64 profile photo is the only body that gets near this. The
  // photo route enforces its own, much tighter, decoded-size limit.
  app.use(express.json({ limit: '2mb' }));

  // Profile photos. Served straight off disk so user rows carry a short path
  // instead of the image bytes — see services/photo.service.
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, {
      // Content-addressed filenames, so a given URL's bytes never change.
      maxAge: '7d',
      // Never infer a type from the URL or run anything out of this directory.
      index: false,
      dotfiles: 'deny',
    }),
  );

  // Request log. Deliberately minimal — one line per request with timing, so
  // the terminal stays readable while demoing.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  app.use('/auth', authRoutes);
  app.use('/me', meRoutes);
  app.use('/geo', geoRoutes);
  app.use('/vehicles', vehicleRoutes);
  app.use('/rides', rideRoutes);
  app.use('/bookings', bookingRoutes);
  app.use('/trips', tripRoutes);
  app.use('/admin', adminRoutes);
  app.use('/reports', reportRoutes);
  app.use('/wallet', walletRoutes);
  app.use('/payments', paymentRoutes);
  app.use('/saved-places', savedPlaceRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
