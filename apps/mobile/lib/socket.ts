import { io, type Socket } from 'socket.io-client';
import { API_URL, currentToken } from './api';

let socket: Socket | null = null;

/**
 * One socket for the whole app. Trip rooms are joined and left as screens
 * mount, but the connection itself persists — reconnecting per screen would
 * drop pings during navigation, which is exactly when a passenger is
 * watching the map.
 */
export function getSocket(): Socket {
  if (socket?.connected) return socket;
  if (socket) socket.connect();
  else {
    socket = io(API_URL, {
      auth: { token: currentToken() },
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.close();
  socket = null;
}

export function joinTrip(tripId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getSocket().emit('trip:join', { tripId }, (r: { ok: boolean; error?: string }) =>
      r?.ok ? resolve() : reject(new Error(r?.error ?? 'Could not join trip')),
    );
  });
}

export function leaveTrip(tripId: string): void {
  socket?.emit('trip:leave', { tripId });
}
