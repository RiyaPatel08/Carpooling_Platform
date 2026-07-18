/**
 * Every failure the client should see is an AppError. Anything else escaping
 * to the error handler is a bug and gets logged with a stack, then reported
 * as a generic 500 — we never leak internals to the client.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, msg, 'BAD_REQUEST', details);

export const unauthorized = (msg = 'Please sign in to continue') =>
  new AppError(401, msg, 'UNAUTHORIZED');

/** Used for both "not your row" and "not your org" — never say which. */
export const forbidden = (msg = 'You do not have permission to do that') =>
  new AppError(403, msg, 'FORBIDDEN');

export const notFound = (msg = 'Not found') => new AppError(404, msg, 'NOT_FOUND');

/** State-machine violations and lost seat races land here. */
export const conflict = (msg: string, code = 'CONFLICT') => new AppError(409, msg, code);

export const unprocessable = (msg: string, details?: unknown) =>
  new AppError(422, msg, 'UNPROCESSABLE', details);

export const badGateway = (msg: string) => new AppError(502, msg, 'UPSTREAM_ERROR');
