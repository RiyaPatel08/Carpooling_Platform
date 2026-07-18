import { z } from 'zod';
import { emailSchema, phoneSchema, passwordSchema } from './auth.js';
import { roleSchema, safetyEventKindSchema } from './enums.js';

/** Admin Employees tab → "+ Add Employee". */
export const employeeCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  role: roleSchema.default('employee'),
  department: z.string().trim().max(80).optional(),
  manager: z.string().trim().max(120).optional(),
  location: z.string().trim().max(80).optional(),
});
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
  role: roleSchema.optional(),
  department: z.string().trim().max(80).nullable().optional(),
  manager: z.string().trim().max(120).nullable().optional(),
  location: z.string().trim().max(80).nullable().optional(),
  /** The mockup's "Platform Access: Granted / Revoked" toggle. */
  isActive: z.boolean().optional(),
});

/** Admin Settings tab. These values feed the fare suggestion directly. */
export const orgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  registeredAddress: z.string().trim().max(200).nullable().optional(),
  industry: z.string().trim().max(80).nullable().optional(),
  adminContact: emailSchema.optional(),
  fuelCostPerLitre: z.coerce
    .number()
    .positive('Fuel cost must be greater than 0')
    .max(500, 'Fuel cost looks unrealistic')
    .optional(),
  defaultMileageKmpl: z.coerce
    .number()
    .positive('Mileage must be greater than 0')
    .max(60, 'Mileage looks unrealistic')
    .optional(),
  costPerKm: z.coerce.number().nonnegative().max(500).optional(),
});
export type OrgSettingsInput = z.infer<typeof orgSettingsSchema>;

export const safetyEventSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  kind: safetyEventKindSchema,
  detail: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  createdAt: z.string(),
  ride: z.object({
    id: z.string().uuid(),
    originLabel: z.string(),
    destLabel: z.string(),
    driverName: z.string(),
  }),
});
export type SafetyEvent = z.infer<typeof safetyEventSchema>;
