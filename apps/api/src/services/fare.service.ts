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

/**
 * Floor on the share of the route a passenger is billed for.
 *
 * A passenger riding 5% of a 40 km corridor does not cost the driver 5% of the
 * trip: the driver still detours to the pickup, stops, and rejoins the route.
 * Billing strictly by distance would make short hops effectively free and push
 * the cost onto whoever rides furthest. Every ride-share prices this the same
 * way — a minimum fare. Tune here if the demo corridor makes it look wrong.
 */
export const MIN_FARE_FRACTION = 0.25;

/**
 * What a passenger owes for the sub-segment they actually ride.
 *
 * `fraction` is how much of the driver's route lies between the passenger's
 * pickup and drop, as returned by ST_LineLocatePoint. A passenger boarding at
 * the origin and alighting at the destination gets 1.0 and pays the full
 * per-seat fare; a mid-corridor hop pays proportionally less. Without this,
 * corridor matching sells a 5 km leg at the price of a 40 km one — which is
 * the whole point of matching on sub-segments in the first place.
 */
export function bookingFare(farePerSeat: number, seats: number, fraction = 1): number {
  if (seats < 1) throw new Error('seats must be at least 1');
  if (!Number.isFinite(fraction)) fraction = 1;
  const share = Math.min(1, Math.max(MIN_FARE_FRACTION, fraction));
  return round2(farePerSeat * seats * share);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
