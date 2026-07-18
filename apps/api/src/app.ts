import express from 'express';
import cors from 'cors';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRoutes, meRoutes } from './routes/auth.routes.js';
import { geoRoutes } from './routes/geo.routes.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
