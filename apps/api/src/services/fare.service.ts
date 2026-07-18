import type { FareSuggestion } from '@syncroute/shared';

export interface FareInputs {
  distanceM: number;
  /** Vehicle's own mileage; falls back to the org default when unset. */
  mileageKmpl: number;
  fuelCostPerLitre: number;
  /** Seats offered to passengers, excluding the driver. */
  seatsTotal: number;
}

/**
 * Cost-sharing fare, per PLANNING §6 and the mentor's directive.
 *
 *   fuel cost  = (distance_km / mileage_kmpl) x fuel_cost_per_litre
 *   per seat   = fuel cost / (seats_total + 1)
 *
 * The +1 is the driver's own share: this is carpooling, not a taxi. A driver
 * offering 3 seats recovers 3/4 of their fuel, never a profit — which is also
 * what keeps the platform outside commercial-transport regulation.
 */
export function suggestFare(input: FareInputs): FareSuggestion {
  const { distanceM, mileageKmpl, fuelCostPerLitre, seatsTotal } = input;

  if (distanceM <= 0) throw new Error('distanceM must be positive');
  if (mileageKmpl <= 0) throw new Error('mileageKmpl must be positive');
  if (fuelCostPerLitre <= 0) throw new Error('fuelCostPerLitre must be positive');
  if (seatsTotal < 1) throw new Error('seatsTotal must be at least 1');

  const distanceKm = distanceM / 1000;
  const litres = distanceKm / mileageKmpl;
  const tripFuelCost = litres * fuelCostPerLitre;
  const splitAcross = seatsTotal + 1;

  return {
    tripFuelCost: round2(tripFuelCost),
    // Rounded to the rupee: nobody splits fuel to the paisa, and a clean
    // number is what the Offer Ride form prefills.
    suggestedFarePerSeat: Math.round(tripFuelCost / splitAcross),
    breakdown: {
      distanceKm: round2(distanceKm),
      mileageKmpl,
      fuelCostPerLitre,
      splitAcross,
    },
  };
}

/** What a passenger owes: per-seat fare times seats taken. */
export function bookingFare(farePerSeat: number, seats: number): number {
  if (seats < 1) throw new Error('seats must be at least 1');
  return round2(farePerSeat * seats);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
