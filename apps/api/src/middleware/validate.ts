import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Parse-and-replace: the handler downstream sees only validated, coerced,
 * transformed data. Unknown keys are dropped by Zod objects, so a client
 * cannot smuggle extra fields (org_id, role, status) into a create call.
 */
export const validateBody =
  <T>(schema: ZodSchema<T>): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };

export const validateQuery =
  <T>(schema: ZodSchema<T>): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    // Express 4's req.query is a getter-only property on some versions.
    Object.defineProperty(req, 'query', { value: result.data, writable: true });
    next();
  };

export const validateParams =
  <T>(schema: ZodSchema<T>): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(result.error);
    req.params = result.data as typeof req.params;
    next();
  };
