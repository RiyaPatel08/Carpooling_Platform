import { z } from 'zod';
import { pointSchema } from './geo.js';
import { tripStatusSchema, safetyEventKindSchema } from './enums.js';

export const tripSchema = z.object({
  id: z.string().uuid(),
  rideId: z.string().uuid(),
  status: tripStatusSchema,
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type Trip = z.infer<typeof tripSchema>;

export const messageCreateSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(1000, 'Message is too long'),
});

export const messageSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderName: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

// ---------------------------------------------------------------------------
// Socket.IO event payloads. Same names on both ends.
// ---------------------------------------------------------------------------

/** Driver → server, every 2–3s while a trip is in progress. */
export const locationUpdateSchema = z.object({
  tripId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().nonnegative().max(200).optional(),
  recordedAt: z.string().datetime().optional(),
});
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;

/** Server → trip room, after persisting the ping. */
export const locationBroadcastSchema = z.object({
  tripId: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
  speed: z.number().nullable(),
  recordedAt: z.string(),
  /** Metres still to travel along the route polyline. */
  remainingM: z.number().nullable(),
  etaSeconds: z.number().nullable(),
  /** Perpendicular distance from the planned route — feeds the safety alert. */
  offRouteM: z.number().nullable(),
});
export type LocationBroadcast = z.infer<typeof locationBroadcastSchema>;

export const chatMessageEventSchema = z.object({
  tripId: z.string().uuid(),
  body: z.string().trim().min(1).max(1000),
});

export const tripStatusEventSchema = z.object({
  tripId: z.string().uuid(),
  status: tripStatusSchema,
  /** Set when a booking is cancelled so the driver sees seats come back. */
  seatsAvailable: z.number().optional(),
  message: z.string().optional(),
});

export const safetyAlertSchema = z.object({
  tripId: z.string().uuid(),
  kind: safetyEventKindSchema,
  point: pointSchema.nullable(),
  /** Metres off the planned corridor when the alert fired. */
  offRouteM: z.number().nullable(),
  detail: z.string(),
  createdAt: z.string(),
});
export type SafetyAlert = z.infer<typeof safetyAlertSchema>;

export const sosSchema = z.object({
  tripId: z.string().uuid(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const SOCKET_EVENTS = {
  joinTrip: 'trip:join',
  leaveTrip: 'trip:leave',
  locationUpdate: 'location:update',
  locationBroadcast: 'location:broadcast',
  chatMessage: 'chat:message',
  tripStatus: 'trip:status',
  safetyAlert: 'safety:alert',
  sos: 'safety:sos',
} as const;
