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
    distanceKm: z.number(),
    /** Fares passengers actually paid. */
    revenue: z.number(),
    fuelCost: z.number(),
    /**
     * Wear, servicing and tyres. Derived as the non-fuel part of the org's
     * configured cost-per-km, so it moves with distance driven and needs no
     * separate data entry.
     */
    maintenanceCost: z.number(),
    /** revenue − (fuel + maintenance). */
    netProfit: z.number(),
    co2SavedKg: z.number(),
  }),
);
export type MonthlyReport = z.infer<typeof monthlyReportSchema>;

/**
 * The mobile app's Reports screen: one employee's own month, not the org's.
 * Org-wide numbers stay on the admin web app's Reports tab; this is "what
 * did carpooling cost or earn ME this month," split by the two roles the
 * same person can play across different rides.
 */
export const userMonthlyReportSchema = z.array(
  z.object({
    month: z.string(),
    tripsAsDriver: z.number(),
    tripsAsPassenger: z.number(),
    distanceKm: z.number(),
    /** What driving your own rides cost: fuel plus the non-fuel share of
     *  the org's configured cost-per-km, same convention as the org report. */
    fuelCost: z.number(),
    maintenanceCost: z.number(),
    /** Fares your passengers paid you, as a driver. */
    earnings: z.number(),
    /** Fares you paid, as a passenger. */
    fareSpent: z.number(),
    /** earnings − fuelCost − maintenanceCost − fareSpent: your personal cash flow. */
    netAmount: z.number(),
    co2SavedKg: z.number(),
  }),
);
export type UserMonthlyReport = z.infer<typeof userMonthlyReportSchema>;
