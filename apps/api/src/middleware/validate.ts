import type { RequestHandler } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Schemas that transform (recurrence day-array -> "MO,TU", phone stripping)
 * have an input type that differs from their output, so both are generic
 * here. Pinning only one collapses the pair and rejects those schemas.
 */
type AnySchema<Out> = ZodType<Out, ZodTypeDef, unknown>;

/**
 * Parse-and-replace: the handler downstream sees only validated, coerced,
 * transformed data. Unknown keys are dropped by Zod objects, so a client
 * cannot smuggle extra fields (org_id, role, status) into a create call.
 */
export const validateBody =
  <T>(schema: AnySchema<T>): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };

export const validateQuery =
  <T>(schema: AnySchema<T>): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    // Express 4's req.query is a getter-only property on some versions.
    Object.defineProperty(req, 'query', { value: result.data, writable: true });
    next();
  };

export const validateParams =
  <T>(schema: AnySchema<T>): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(result.error);
    req.params = result.data as typeof req.params;
    next();
  };
