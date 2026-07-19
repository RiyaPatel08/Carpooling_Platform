import { z } from 'zod';
import { placeSchema } from './geo.js';
import { rideStatusSchema } from './enums.js';

/** Weekday codes for a recurring ride. Stored as a rule; no instances generated. */
export const recurrenceRuleSchema = z
  .array(z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']))
  .min(1, 'Pick at least one day')
  .transform((days) => [...new Set(days)].join(','));

export const rideCreateSchema = z.object({
  vehicleId: z.string().uuid('Select a vehicle'),
  origin: placeSchema,
  destination: placeSchema,
  departureAt: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now() - 60_000, 'Departure time cannot be in the past'),
  // Seats offered to passengers — excludes the driver's own seat.
  seatsTotal: z.coerce
    .number()
    .int('Seats must be a whole number')
    .min(1, 'Offer at least 1 seat')
    .max(7, 'Cannot offer more than 7 seats'),
  farePerSeat: z.coerce
    .number()
    .nonnegative('Fare cannot be negative')
    .max(10000, 'Fare looks unrealistic'),
  recurrenceRule: recurrenceRuleSchema.optional(),
});
export type RideCreateInput = z.infer<typeof rideCreateSchema>;

/**
 * Search accepts pickup/drop coordinates so corridor matching can run.
 * Without them the API falls back to the baseline org-wide time-window list.
 */
export const rideSearchSchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90).optional(),
  fromLng: z.coerce.number().min(-180).max(180).optional(),
  toLat: z.coerce.number().min(-90).max(90).optional(),
  toLng: z.coerce.number().min(-180).max(180).optional(),
  date: z.coerce.date().optional(),
  seats: z.coerce.number().int().min(1).max(7).default(1),
  /** Half-width of the departure-time window, in hours. */
  windowHours: z.coerce.number().min(0.5).max(24).default(2),
});
export type RideSearchInput = z.infer<typeof rideSearchSchema>;

export const fareSuggestSchema = z.object({
  distanceM: z.coerce.number().positive(),
  vehicleId: z.string().uuid(),
  seatsTotal: z.coerce.number().int().min(1).max(7),
});

export const fareSuggestionSchema = z.object({
  /** Whole-journey fuel cost, before splitting. */
  tripFuelCost: z.number(),
  suggestedFarePerSeat: z.number(),
  breakdown: z.object({
    distanceKm: z.number(),
    mileageKmpl: z.number(),
    fuelCostPerLitre: z.number(),
    /** Driver takes a share too, so this is seatsTotal + 1. */
    splitAcross: z.number(),
  }),
});
export type FareSuggestion = z.infer<typeof fareSuggestionSchema>;

export const rideSummarySchema = z.object({
  id: z.string().uuid(),
  driver: z.object({
    id: z.string().uuid(),
    name: z.string(),
    photoUrl: z.string().nullable(),
    phone: z.string().optional(),
  }),
  vehicle: z.object({
    model: z.string(),
    registrationNo: z.string(),
  }),
  originLabel: z.string(),
  destLabel: z.string(),
  departureAt: z.string(),
  seatsTotal: z.number(),
  seatsAvailable: z.number(),
  farePerSeat: z.number(),
  routeDistanceM: z.number().nullable(),
  routeDurationS: z.number().nullable(),
  recurrenceRule: z.string().nullable(),
  status: rideStatusSchema,
  /**
   * Present only on corridor-matched results. This is the number the demo
   * hangs on — "+4 min detour" is what endpoint-matching cannot produce.
   */
  detourMinutes: z.number().nullable().optional(),
  matchScore: z.number().nullable().optional(),
  /**
   * Per-seat price for the sub-segment THIS passenger asked for, which is what
   * they will actually be charged. Equals farePerSeat on a whole-route match;
   * lower on a mid-corridor hop. Shown instead of farePerSeat so the search
   * result and the booking confirmation never disagree.
   */
  yourFarePerSeat: z.number().nullable().optional(),
});
export type RideSummary = z.infer<typeof rideSummarySchema>;
