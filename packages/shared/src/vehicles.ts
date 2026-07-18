import { z } from 'zod';
import { vehicleStatusSchema } from './enums.js';

/** Indian plate, e.g. GJ01AB1234. Spaces and dashes are stripped first. */
export const registrationNoSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/, 'Enter a valid registration number, e.g. GJ01AB1234'),
  );

export const vehicleCreateSchema = z.object({
  model: z.string().trim().min(2, 'Vehicle model is required').max(80),
  registrationNo: registrationNoSchema,
  // Seats the vehicle has in total, driver included.
  seatingCapacity: z.coerce
    .number()
    .int('Seating capacity must be a whole number')
    .min(2, 'A vehicle needs at least 2 seats to carpool')
    .max(8, 'Seating capacity cannot exceed 8'),
  mileageKmpl: z.coerce
    .number()
    .positive('Mileage must be greater than 0')
    .max(60, 'Mileage looks unrealistic')
    .optional(),
  color: z.string().trim().max(40).optional(),
});
export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;

export const vehicleUpdateSchema = vehicleCreateSchema.partial();

export const vehicleSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  ownerName: z.string().optional(),
  model: z.string(),
  registrationNo: z.string(),
  seatingCapacity: z.number(),
  mileageKmpl: z.number().nullable(),
  color: z.string().nullable(),
  status: vehicleStatusSchema,
});
export type Vehicle = z.infer<typeof vehicleSchema>;

/** Admin-only: the Vehicles tab approve / deactivate action. */
export const vehicleStatusUpdateSchema = z.object({
  status: vehicleStatusSchema,
});
