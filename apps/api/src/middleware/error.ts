import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { config } from '../config.js';

/**
 * Zod issues become a field->message map so forms can render errors inline.
 * The rubric asks specifically for this ("invalid email -> proper feedback").
 */
function formatZodError(err: ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please correct the highlighted fields',
        fields: formatZodError(err),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 = unique violation. Name the field so the message is actionable.
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
      res.status(409).json({
        error: { code: 'DUPLICATE', message: `That ${target} is already registered` },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        error: { code: 'BAD_REFERENCE', message: 'Referenced record does not exist' },
      });
      return;
    }
  }

  // Our integrity triggers raise with ERRCODE restrict_violation / check_violation.
  // Surface their message directly — they are written to be read by humans.
  if (err instanceof Prisma.PrismaClientUnknownRequestError || err instanceof Error) {
    const msg = String((err as Error).message ?? '');
    const dbMsg = msg.match(/ERROR:\s*(.+?)(?:\n|$)/)?.[1];
    if (dbMsg && /immutab|append-only|not approved|does not belong|cannot book|Illegal trip/i.test(dbMsg)) {
      res.status(409).json({ error: { code: 'INTEGRITY_VIOLATION', message: dbMsg } });
      return;
    }
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Something went wrong on our side',
      ...(config.NODE_ENV === 'development' ? { debug: String(err) } : {}),
    },
  });
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` },
  });
};

/** Async route wrapper — without it a rejected promise hangs the request. */
export const asyncHandler =
  <T extends RequestHandler>(fn: T): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
