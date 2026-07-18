import { z } from 'zod';

export const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/**
 * CO2 avoided per passenger-kilometre. A carpooled passenger-km displaces a
 * solo car km; 0.12 kg/km is the standard small-petrol-car tailpipe figure
 * used in Indian corporate ESG reporting.
 */
export const CO2_KG_PER_PASSENGER_KM = 0.12;

export const reportSummarySchema = z.object({
  totalTrips: z.number(),
  totalDistanceKm: z.number(),
  totalFuelCost: z.number(),
  costPerKm: z.number(),
  /** Booked seats ÷ offered seats, as a percentage. */
  utilizationRate: z.number(),
  totalPassengerKm: z.number(),
  co2SavedKg: z.number(),
  activeEmployees: z.number(),
  registeredVehicles: z.number(),
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

export const vehicleReportSchema = z.array(
  z.object({
    vehicleId: z.string().uuid(),
    model: z.string(),
    registrationNo: z.string(),
    ownerName: z.string(),
    trips: z.number(),
    distanceKm: z.number(),
    fuelCost: z.number(),
    costPerKm: z.number(),
  }),
);
export type VehicleReport = z.infer<typeof vehicleReportSchema>;

/** Mockup: "Financial Summary of Month" table. */
export const monthlyReportSchema = z.array(
  z.object({
    month: z.string(),
    trips: z.number(),
    revenue: z.number(),
    fuelCost: z.number(),
    netProfit: z.number(),
    co2SavedKg: z.number(),
  }),
);
export type MonthlyReport = z.infer<typeof monthlyReportSchema>;
