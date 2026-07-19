import { Router } from 'express';
import { routeQuerySchema, autocompleteQuerySchema, reverseQuerySchema } from '@syncroute/shared';
import { validateQuery } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { routeBetween } from '../lib/osrm.js';
import { config } from '../config.js';
import { badGateway } from '../lib/errors.js';

export const geoRoutes = Router();
geoRoutes.use(requireAuth);

/** Route Confirmation screen: draw the polyline before committing to a ride. */
geoRoutes.get(
  '/route',
  validateQuery(routeQuerySchema),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      fromLat: number;
      fromLng: number;
      toLat: number;
      toLng: number;
    };
    const leg = await routeBetween(
      { lat: q.fromLat, lng: q.fromLng },
      { lat: q.toLat, lng: q.toLng },
    );
    res.json(leg);
  }),
);

/**
 * Photon proxy for location autocomplete. Proxied rather than called from the
 * apps so the mobile client needs no extra network permission and we could
 * swap in a self-hosted Photon by changing one env var.
 */
geoRoutes.get(
  '/autocomplete',
  validateQuery(autocompleteQuerySchema),
  asyncHandler(async (req, res) => {
    const { q, limit } = req.query as unknown as { q: string; limit: number };

    // Bias results to the Ahmedabad–Gandhinagar corridor; without this a
    // search for "Infocity" returns hits from all over the world.
    const url =
      `${config.PHOTON_URL}/api?q=${encodeURIComponent(q)}` +
      `&limit=${limit}&lat=23.05&lon=72.60&lang=en`;

    let upstream: Response;
    try {
      upstream = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    } catch (err) {
      throw badGateway(`Location search unavailable: ${(err as Error).message}`);
    }
    if (!upstream.ok) throw badGateway(`Location search returned ${upstream.status}`);

    const body = (await upstream.json()) as {
      features?: {
        geometry: { coordinates: [number, number] };
        properties: Record<string, string | undefined>;
      }[];
    };

    // Flatten Photon's GeoJSON into the {label, lat, lng} shape the forms use.
    const results = (body.features ?? []).map((f) => {
      const p = f.properties;
      const label = [p.name, p.street, p.district, p.city, p.state]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(', ');
      return {
        label: label || p.name || 'Unknown place',
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      };
    });

    res.json(results);
  }),
);

/**
 * Reverse geocode: coordinates to a human label.
 *
 * Needed by "use my current location" and by dropping a pin on the map — both
 * produce coordinates, and a booking whose pickup reads "23.0421, 72.5714" is
 * useless to the driver who has to find the passenger.
 */
geoRoutes.get(
  '/reverse',
  validateQuery(reverseQuerySchema),
  asyncHandler(async (req, res) => {
    const { lat, lng } = req.query as unknown as { lat: number; lng: number };

    let upstream: Response;
    try {
      upstream = await fetch(`${config.PHOTON_URL}/reverse?lat=${lat}&lon=${lng}&lang=en`, {
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      // A pin without a name is still a usable pin: fall back to coordinates
      // rather than failing the whole location selection.
      res.json({ label: `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng });
      return;
    }

    if (!upstream.ok) {
      res.json({ label: `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng });
      return;
    }

    const body = (await upstream.json()) as {
      features?: { properties: Record<string, string | undefined> }[];
    };
    const p = body.features?.[0]?.properties;
    const label =
      [p?.name, p?.street, p?.district, p?.city]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(', ') || `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

    res.json({ label, lat, lng });
  }),
);
