import { z } from 'zod';

/** WGS84 coordinate. Rejects the classic swapped lat/lng bug by range alone. */
export const latSchema = z.number().min(-90).max(90);
export const lngSchema = z.number().min(-180).max(180);

export const pointSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
});
export type Point = z.infer<typeof pointSchema>;

/** A place the user picked: coordinates plus the human label we show back. */
export const placeSchema = pointSchema.extend({
  label: z.string().min(1).max(200),
});
export type Place = z.infer<typeof placeSchema>;

export const routeQuerySchema = z.object({
  fromLat: z.coerce.number().pipe(latSchema),
  fromLng: z.coerce.number().pipe(lngSchema),
  toLat: z.coerce.number().pipe(latSchema),
  toLng: z.coerce.number().pipe(lngSchema),
});

export const routeResponseSchema = z.object({
  distanceM: z.number(),
  durationS: z.number(),
  /** GeoJSON-order coordinates: [lng, lat]. */
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});
export type RouteResponse = z.infer<typeof routeResponseSchema>;

export const autocompleteQuerySchema = z.object({
  q: z.string().min(2, 'Type at least 2 characters'),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const savedPlaceCreateSchema = z.object({
  label: z.string().min(1).max(50),
  placeName: z.string().min(1).max(120),
  lat: latSchema,
  lng: lngSchema,
});
export type SavedPlaceCreate = z.infer<typeof savedPlaceCreateSchema>;
