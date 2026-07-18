import { Server as SocketServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { SOCKET_EVENTS, locationUpdateSchema, chatMessageEventSchema, sosSchema } from '@syncroute/shared';
import type { JwtPayload } from '@syncroute/shared';
import { verifyAccessToken } from '../lib/tokens.js';
import { prisma } from '../db.js';
import * as trips from '../services/trip.service.js';
import { recordPing, recordSos } from '../services/tracking.service.js';

let io: SocketServer | null = null;

/** Room name for a trip. One room carries location, chat and status. */
const room = (tripId: string) => `trip:${tripId}`;

interface AuthedSocket extends Socket {
  auth?: JwtPayload;
}

export function initRealtime(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: { origin: '*' },
    // Ping cadence is 2-3s; keep the connection tolerant of a phone that
    // briefly loses signal rather than tearing the room down.
    pingTimeout: 30_000,
  });

  // Same JWT as REST. An unauthenticated socket never reaches a handler.
  io.use((socket: AuthedSocket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.auth = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const user = socket.auth!;

    socket.on(SOCKET_EVENTS.joinTrip, async (payload: { tripId?: string }, ack?: (r: unknown) => void) => {
      try {
        const tripId = String(payload?.tripId ?? '');
        if (!tripId) throw new Error('tripId is required');
        // Authorise per join: only the driver and booked passengers may see
        // a vehicle's live position.
        await trips.assertParticipant(tripId, user.sub);
        await socket.join(room(tripId));
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    });

    socket.on(SOCKET_EVENTS.leaveTrip, (payload: { tripId?: string }) => {
      if (payload?.tripId) void socket.leave(room(String(payload.tripId)));
    });

    // --- live location -----------------------------------------------------
    socket.on(SOCKET_EVENTS.locationUpdate, async (raw: unknown, ack?: (r: unknown) => void) => {
      const parsed = locationUpdateSchema.safeParse(raw);
      if (!parsed.success) {
        ack?.({ ok: false, error: 'Invalid location payload' });
        return;
      }
      try {
        const trip = await prisma.trip.findUnique({
          where: { id: parsed.data.tripId },
          include: { ride: { select: { driverId: true } } },
        });
        if (!trip) throw new Error('Trip not found');
        // Only the driver's phone is the source of truth for position.
        if (trip.ride.driverId !== user.sub) throw new Error('Only the driver can send location');

        const result = await recordPing(parsed.data);
        io?.to(room(parsed.data.tripId)).emit(SOCKET_EVENTS.locationBroadcast, result.broadcast);

        // Deviation detection runs server-side on every ping, so a tampered
        // client cannot suppress its own alert.
        if (result.alert) {
          io?.to(room(parsed.data.tripId)).emit(SOCKET_EVENTS.safetyAlert, result.alert);
        }
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    });

    // --- chat --------------------------------------------------------------
    socket.on(SOCKET_EVENTS.chatMessage, async (raw: unknown, ack?: (r: unknown) => void) => {
      const parsed = chatMessageEventSchema.safeParse(raw);
      if (!parsed.success) {
        ack?.({ ok: false, error: 'Message cannot be empty' });
        return;
      }
      try {
        await trips.assertParticipant(parsed.data.tripId, user.sub);
        const saved = await prisma.message.create({
          data: { tripId: parsed.data.tripId, senderId: user.sub, body: parsed.data.body },
          include: { sender: { select: { name: true } } },
        });
        io?.to(room(parsed.data.tripId)).emit(SOCKET_EVENTS.chatMessage, {
          id: saved.id,
          tripId: saved.tripId,
          senderId: saved.senderId,
          senderName: saved.sender.name,
          body: saved.body,
          createdAt: saved.createdAt.toISOString(),
        });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    });

    // --- SOS ---------------------------------------------------------------
    socket.on(SOCKET_EVENTS.sos, async (raw: unknown, ack?: (r: unknown) => void) => {
      const parsed = sosSchema.safeParse(raw);
      if (!parsed.success) {
        ack?.({ ok: false, error: 'Invalid SOS payload' });
        return;
      }
      try {
        await trips.assertParticipant(parsed.data.tripId, user.sub);
        const alert = await recordSos(parsed.data, user.sub);
        io?.to(room(parsed.data.tripId)).emit(SOCKET_EVENTS.safetyAlert, alert);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    });
  });

  return io;
}

/** Fire an event into a trip room from outside a socket handler (REST). */
export function emitToTrip(tripId: string, event: string, payload: unknown): void {
  io?.to(room(tripId)).emit(event, payload);
}
