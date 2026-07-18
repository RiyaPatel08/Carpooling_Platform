import type { ReportSummary, VehicleReport, MonthlyReport } from '@syncroute/shared';
import { CO2_KG_PER_PASSENGER_KM } from '@syncroute/shared';
import { prisma } from '../db.js';

/**
 * Reports are SQL aggregates, not application loops. The numbers come from
 * trip, booking and vehicle rows the platform already wrote, so they cannot
 * drift from what actually happened.
 *
 * The distance a passenger is credited with is the RIDE's distance, since a
 * booking rides a sub-segment we do not separately measure. That slightly
 * overstates passenger-km for short hops; it is the same convention every
 * corporate ESG report uses, and it is stated here rather than hidden.
 */

interface Window {
  from?: Date;
  to?: Date;
}

/** Completed trips only — an in-flight ride has not saved anything yet. */
function windowClause(w: Window) {
  return {
    from: w.from ?? new Date(0),
    to: w.to ?? new Date('2100-01-01T00:00:00.000Z'),
  };
}

export async function summary(orgId: string, w: Window = {}): Promise<ReportSummary> {
  const { from, to } = windowClause(w);

  const rows = await prisma.$queryRaw<
    {
      total_trips: bigint;
      total_distance_m: number | null;
      total_fuel_cost: number | null;
      total_passenger_km: number | null;
      seats_offered: bigint | null;
      seats_booked: bigint | null;
    }[]
  >`
    WITH completed AS (
      SELECT
        r.id, r.route_distance_m, r.seats_total,
        COALESCE(v.mileage_kmpl, o.default_mileage_kmpl) AS mileage,
        o.fuel_cost_per_litre,
        COALESCE(SUM(b.seats) FILTER (WHERE b.status = 'completed'), 0) AS booked_seats
      FROM rides r
      JOIN trips t         ON t.ride_id = r.id
      JOIN vehicles v      ON v.id = r.vehicle_id
      JOIN organizations o ON o.id = r.org_id
      LEFT JOIN bookings b ON b.ride_id = r.id
      WHERE r.org_id = ${orgId}
        AND t.status IN ('completed', 'payment_pending', 'payment_completed')
        AND t.completed_at BETWEEN ${from} AND ${to}
      GROUP BY r.id, r.route_distance_m, r.seats_total, v.mileage_kmpl,
               o.default_mileage_kmpl, o.fuel_cost_per_litre
    )
    SELECT
      COUNT(*)::bigint AS total_trips,
      SUM(route_distance_m) AS total_distance_m,
      -- Fuel burned by the vehicle, priced at the org's configured rate.
      SUM((route_distance_m / 1000.0) / mileage * fuel_cost_per_litre) AS total_fuel_cost,
      -- Passenger-km: the ESG numerator.
      SUM((route_distance_m / 1000.0) * booked_seats) AS total_passenger_km,
      SUM(seats_total)::bigint AS seats_offered,
      SUM(booked_seats)::bigint AS seats_booked
    FROM completed
  `;

  const r = rows[0];
  const totalDistanceKm = Number(r.total_distance_m ?? 0) / 1000;
  const totalFuelCost = Number(r.total_fuel_cost ?? 0);
  const totalPassengerKm = Number(r.total_passenger_km ?? 0);
  const seatsOffered = Number(r.seats_offered ?? 0);
  const seatsBooked = Number(r.seats_booked ?? 0);

  const [activeEmployees, registeredVehicles] = await Promise.all([
    prisma.user.count({ where: { orgId, isActive: true } }),
    prisma.vehicle.count({ where: { orgId } }),
  ]);

  return {
    totalTrips: Number(r.total_trips),
    totalDistanceKm: round(totalDistanceKm),
    totalFuelCost: round(totalFuelCost),
    costPerKm: totalDistanceKm > 0 ? round(totalFuelCost / totalDistanceKm) : 0,
    utilizationRate: seatsOffered > 0 ? round((seatsBooked / seatsOffered) * 100) : 0,
    totalPassengerKm: round(totalPassengerKm),
    // Every carpooled passenger-km is a solo car km that did not happen.
    co2SavedKg: round(totalPassengerKm * CO2_KG_PER_PASSENGER_KM),
    activeEmployees,
    registeredVehicles,
  };
}

export async function byVehicle(orgId: string, w: Window = {}): Promise<VehicleReport> {
  const { from, to } = windowClause(w);

  const rows = await prisma.$queryRaw<
    {
      vehicle_id: string;
      model: string;
      registration_no: string;
      owner_name: string;
      trips: bigint;
      distance_m: number | null;
      fuel_cost: number | null;
    }[]
  >`
    SELECT
      v.id AS vehicle_id, v.model, v.registration_no, u.name AS owner_name,
      COUNT(t.id)::bigint AS trips,
      SUM(r.route_distance_m) AS distance_m,
      SUM((r.route_distance_m / 1000.0)
          / COALESCE(v.mileage_kmpl, o.default_mileage_kmpl)
          * o.fuel_cost_per_litre) AS fuel_cost
    FROM vehicles v
    JOIN users u         ON u.id = v.owner_id
    JOIN organizations o ON o.id = v.org_id
    LEFT JOIN rides r    ON r.vehicle_id = v.id
    LEFT JOIN trips t    ON t.ride_id = r.id
                        AND t.status IN ('completed', 'payment_pending', 'payment_completed')
                        AND t.completed_at BETWEEN ${from} AND ${to}
    WHERE v.org_id = ${orgId}
    GROUP BY v.id, v.model, v.registration_no, u.name
    ORDER BY SUM(r.route_distance_m) DESC NULLS LAST
  `;

  return rows.map((v) => {
    const distanceKm = Number(v.distance_m ?? 0) / 1000;
    const fuelCost = Number(v.fuel_cost ?? 0);
    return {
      vehicleId: v.vehicle_id,
      model: v.model,
      registrationNo: v.registration_no,
      ownerName: v.owner_name,
      trips: Number(v.trips),
      distanceKm: round(distanceKm),
      fuelCost: round(fuelCost),
      costPerKm: distanceKm > 0 ? round(fuelCost / distanceKm) : 0,
    };
  });
}

/** Mockup's "Financial Summary of Month" table. */
export async function monthly(orgId: string, months = 6): Promise<MonthlyReport> {
  const rows = await prisma.$queryRaw<
    {
      month: Date;
      trips: bigint;
      revenue: number | null;
      fuel_cost: number | null;
      passenger_km: number | null;
    }[]
  >`
    SELECT
      date_trunc('month', t.completed_at) AS month,
      COUNT(DISTINCT t.id)::bigint AS trips,
      -- Revenue is what passengers actually paid, from the bookings.
      SUM(b.fare_total) AS revenue,
      SUM((r.route_distance_m / 1000.0)
          / COALESCE(v.mileage_kmpl, o.default_mileage_kmpl)
          * o.fuel_cost_per_litre) AS fuel_cost,
      SUM((r.route_distance_m / 1000.0) * b.seats) AS passenger_km
    FROM trips t
    JOIN rides r         ON r.id = t.ride_id
    JOIN vehicles v      ON v.id = r.vehicle_id
    JOIN organizations o ON o.id = r.org_id
    LEFT JOIN bookings b ON b.ride_id = r.id AND b.status = 'completed'
    WHERE r.org_id = ${orgId}
      AND t.status IN ('completed', 'payment_pending', 'payment_completed')
      AND t.completed_at > NOW() - (${months} || ' months')::interval
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  return rows.map((m) => {
    const revenue = Number(m.revenue ?? 0);
    const fuelCost = Number(m.fuel_cost ?? 0);
    return {
      month: m.month.toISOString().slice(0, 7),
      trips: Number(m.trips),
      revenue: round(revenue),
      fuelCost: round(fuelCost),
      // What the drivers recovered against what the fuel actually cost.
      netProfit: round(revenue - fuelCost),
      co2SavedKg: round(Number(m.passenger_km ?? 0) * CO2_KG_PER_PASSENGER_KM),
    };
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
