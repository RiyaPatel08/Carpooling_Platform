import argon2 from 'argon2';
import type { LoginInput, RegisterInput, AuthResponse, PublicUser } from '@syncroute/shared';
import { prisma } from '../db.js';
import { badRequest, forbidden, unauthorized, notFound } from '../lib/errors.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  ttlToDate,
} from '../lib/tokens.js';
import { config } from '../config.js';

type UserRow = {
  id: string;
  orgId: string;
  role: 'admin' | 'employee';
  name: string;
  email: string;
  phone: string;
  photoUrl: string | null;
  department: string | null;
  location: string | null;
  isActive: boolean;
};

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    orgId: u.orgId,
    role: u.role,
    name: u.name,
    email: u.email,
    phone: u.phone,
    photoUrl: u.photoUrl,
    department: u.department,
    location: u.location,
    isActive: u.isActive,
  };
}

async function issueTokens(user: UserRow): Promise<AuthResponse> {
  const claims = { sub: user.id, orgId: user.orgId, role: user.role };
  const accessToken = signAccessToken(claims);
  const refreshToken = signRefreshToken(claims);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: ttlToDate(config.REFRESH_TOKEN_TTL),
    },
  });

  return { user: toPublicUser(user), accessToken, refreshToken };
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  const org = await prisma.organization.findUnique({ where: { code: input.orgCode } });
  if (!org) {
    throw badRequest('That company code was not recognised. Check with your administrator.');
  }

  const existing = await prisma.user.findUnique({
    where: { orgId_email: { orgId: org.id, email: input.email } },
  });
  if (existing) throw badRequest('An account with that email already exists');

  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await argon2.hash(input.password),
      photoUrl: input.photoUrl ?? null,
      // Self-registered employees are active immediately; the admin can
      // revoke access from the Employees tab. Role is never client-supplied.
      role: 'employee',
    },
  });

  return issueTokens(user);
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  // Email is unique per org, so the same address could in principle exist in
  // two orgs. Resolve by email across orgs and verify the password against
  // each candidate — in practice there is one.
  const candidates = await prisma.user.findMany({ where: { email: input.email } });

  for (const user of candidates) {
    if (await argon2.verify(user.passwordHash, input.password)) {
      if (!user.isActive) {
        throw forbidden('Your platform access has been revoked by your administrator');
      }
      return issueTokens(user);
    }
  }

  // Deliberately identical message for "no such user" and "wrong password" —
  // otherwise this endpoint enumerates who works at the company.
  throw unauthorized('Incorrect email or password');
}

export async function refresh(token: string): Promise<AuthResponse> {
  let claims;
  try {
    claims = verifyRefreshToken(token);
  } catch {
    throw unauthorized('Your session has expired, please sign in again');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthorized('Your session has expired, please sign in again');
  }

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) throw notFound('Account no longer exists');
  if (!user.isActive) throw forbidden('Your platform access has been revoked');

  // Rotate: the presented token is burned as we issue the next one, so a
  // stolen refresh token is usable at most once.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(user);
}

export async function logout(token: string): Promise<void> {
  await prisma.refreshToken
    .updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
    .catch(() => undefined);
}
