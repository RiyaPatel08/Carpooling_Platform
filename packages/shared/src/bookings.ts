import { z } from 'zod';
import { placeSchema } from './geo.js';
import { bookingStatusSchema } from './enums.js';

export const bookingCreateSchema = z.object({
  seats: z.coerce.number().int().min(1, 'Book at least 1 seat').max(7).default(1),
  // Where the passenger actually joins and leaves — a sub-segment of the
  // driver's route, not necessarily the driver's own endpoints.
  pickup: placeSchema,
  drop: placeSchema,
});
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;

export const bookingSchema = z.object({
  id: z.string().uuid(),
  rideId: z.string().uuid(),
  passenger: z.object({
    id: z.string().uuid(),
    name: z.string(),
    photoUrl: z.string().nullable(),
    phone: z.string().optional(),
  }),
  seats: z.number(),
  pickupLabel: z.string(),
  dropLabel: z.string(),
  fareTotal: z.number(),
  status: bookingStatusSchema,
  createdAt: z.string(),
});
export type Booking = z.infer<typeof bookingSchema>;
