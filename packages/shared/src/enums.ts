import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'employee']);
export const vehicleStatusSchema = z.enum(['pending', 'approved', 'inactive']);
export const rideStatusSchema = z.enum(['published', 'started', 'completed', 'cancelled']);
export const bookingStatusSchema = z.enum(['requested', 'booked', 'cancelled', 'completed']);

/** PS §5.4 trip lifecycle. Order matters — the state machine indexes into it. */
export const tripStatusSchema = z.enum([
  'booked',
  'started',
  'in_progress',
  'completed',
  'payment_pending',
  'payment_completed',
]);

export const paymentMethodSchema = z.enum(['cash', 'card', 'upi', 'wallet']);
export const paymentStatusSchema = z.enum(['pending', 'success', 'failed']);
export const ledgerTypeSchema = z.enum(['recharge', 'trip_payment', 'trip_earning', 'refund']);
export const safetyEventKindSchema = z.enum(['route_deviation', 'sos']);

export type Role = z.infer<typeof roleSchema>;
export type VehicleStatus = z.infer<typeof vehicleStatusSchema>;
export type RideStatus = z.infer<typeof rideStatusSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type TripStatus = z.infer<typeof tripStatusSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type LedgerType = z.infer<typeof ledgerTypeSchema>;
export type SafetyEventKind = z.infer<typeof safetyEventKindSchema>;

/**
 * The only legal trip transitions. Anything not listed is rejected by the
 * service layer before it ever reaches the database.
 */
export const TRIP_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  booked: ['started'],
  started: ['in_progress'],
  in_progress: ['completed'],
  completed: ['payment_pending'],
  payment_pending: ['payment_completed'],
  payment_completed: [],
};

/** Terminal states are immutable — enforced again by a DB trigger. */
export const TERMINAL_TRIP_STATES: TripStatus[] = ['completed', 'payment_pending', 'payment_completed'];
