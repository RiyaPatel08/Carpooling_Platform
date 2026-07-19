import { io, type Socket } from 'socket.io-client';
import { API_URL, currentToken } from './api';

let socket: Socket | null = null;

/**
 * Trip rooms the app currently wants to be in, independent of connection
 * state. Socket.IO rooms live on the server-side connection object, so a
 * reconnect (backgrounding the app, a dropped signal) hands this client a
 * brand new connection with no room memberships — the server never resends
 * a "you were in this room" state, and a plain `emit('trip:join', ...)`
 * only fires once, at screen mount. Without tracking this set and rejoining
 * on every 'connect', a chat or tracking screen left open through a
 * reconnect goes silently stale: no error, just no more events, until the
 * screen is revisited and its mount effect rejoins.
 */
const activeTripRooms = new Set<string>();

/**
 * One socket for the whole app. Trip rooms are joined and left as screens
 * mount, but the connection itself persists — reconnecting per screen would
 * drop pings during navigation, which is exactly when a passenger is
 * watching the map.
 */
export function getSocket(): Socket {
  if (socket?.connected) return socket;
  if (socket) {
    socket.connect();
  } else {
    socket = io(API_URL, {
      auth: { token: currentToken() },
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    // Fires on the first connect too (activeTripRooms is empty then, so it's
    // a no-op) and on every reconnect after — that second case is the one
    // that matters.
    socket.on('connect', () => {
      for (const tripId of activeTripRooms) {
        socket!.emit('trip:join', { tripId }, () => {});
      }
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.close();
  socket = null;
  activeTripRooms.clear();
}

export function joinTrip(tripId: string): Promise<void> {
  activeTripRooms.add(tripId);
  return new Promise((resolve, reject) => {
    getSocket().emit('trip:join', { tripId }, (r: { ok: boolean; error?: string }) =>
      r?.ok ? resolve() : reject(new Error(r?.error ?? 'Could not join trip')),
    );
  });
}

export function leaveTrip(tripId: string): void {
  activeTripRooms.delete(tripId);
  socket?.emit('trip:leave', { tripId });
}
