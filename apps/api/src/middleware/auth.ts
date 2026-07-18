import type { RequestHandler } from 'express';
import type { JwtPayload } from '@syncroute/shared';
import { verifyAccessToken } from '../lib/tokens.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import { prisma } from '../db.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

/**
 * Establishes WHO is calling. orgId comes from the signed token and nowhere
 * else — this is the single mechanism that makes multi-tenancy hold, so no
 * handler is ever allowed to read an org id from params or body.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();

    let payload: JwtPayload;
    try {
      payload = verifyAccessToken(header.slice(7));
    } catch {
      throw unauthorized('Your session has expired, please sign in again');
    }

    // Access revoked by an admin must take effect on the next request, not
    // whenever the token happens to expire.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, orgId: true, role: true },
    });
    if (!user) throw unauthorized('Account no longer exists');
    if (!user.isActive) throw forbidden('Your platform access has been revoked by your administrator');

    // Trust the database over the token for authority-bearing claims: an
    // admin demoted five minutes ago must not keep admin powers.
    req.auth = { sub: payload.sub, orgId: user.orgId, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (req.auth.role !== 'admin') {
    return next(forbidden('This action is restricted to company administrators'));
  }
  next();
};

/** Narrowing helper so handlers do not repeat the non-null assertion. */
export function auth(req: Express.Request): JwtPayload {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
