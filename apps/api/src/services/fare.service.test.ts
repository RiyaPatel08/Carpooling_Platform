import { describe, it, expect } from 'vitest';
import { suggestFare, bookingFare } from './fare.service.js';

describe('suggestFare', () => {
  it('splits fuel cost across passengers plus the driver', () => {
    // 18 km at 18 kmpl = 1 L = Rs 96.50, shared 3 passengers + driver.
    const f = suggestFare({
      distanceM: 18_000,
      mileageKmpl: 18,
      fuelCostPerLitre: 96.5,
      seatsTotal: 3,
    });

    expect(f.tripFuelCost).toBe(96.5);
    expect(f.breakdown.splitAcross).toBe(4);
    expect(f.suggestedFarePerSeat).toBe(24); // 96.50 / 4 = 24.125 -> 24
  });

  it('never charges a passenger more than the whole trip costs', () => {
    const f = suggestFare({
      distanceM: 25_000,
      mileageKmpl: 15,
      fuelCostPerLitre: 100,
      seatsTotal: 1,
    });
    // Worst case is a single passenger: still only half, driver pays the rest.
    expect(f.suggestedFarePerSeat).toBeLessThan(f.tripFuelCost);
    expect(f.suggestedFarePerSeat).toBe(83); // 166.67 / 2 = 83.33 -> 83
  });

  it('scales inversely with occupancy', () => {
    const base = { distanceM: 20_000, mileageKmpl: 18, fuelCostPerLitre: 96.5 };
    const one = suggestFare({ ...base, seatsTotal: 1 }).suggestedFarePerSeat;
    const four = suggestFare({ ...base, seatsTotal: 4 }).suggestedFarePerSeat;
    expect(four).toBeLessThan(one);
  });

  it('rejects inputs that would produce a nonsense fare', () => {
    expect(() => suggestFare({ distanceM: 0, mileageKmpl: 18, fuelCostPerLitre: 96, seatsTotal: 3 })).toThrow();
    expect(() => suggestFare({ distanceM: 1000, mileageKmpl: 0, fuelCostPerLitre: 96, seatsTotal: 3 })).toThrow();
    expect(() => suggestFare({ distanceM: 1000, mileageKmpl: 18, fuelCostPerLitre: 0, seatsTotal: 3 })).toThrow();
    expect(() => suggestFare({ distanceM: 1000, mileageKmpl: 18, fuelCostPerLitre: 96, seatsTotal: 0 })).toThrow();
  });
});

describe('bookingFare', () => {
  it('multiplies per-seat fare by seats taken', () => {
    expect(bookingFare(120, 2)).toBe(240);
  });

  it('keeps two decimal places without float drift', () => {
    expect(bookingFare(40.1, 3)).toBe(120.3);
  });

  it('rejects a zero-seat booking', () => {
    expect(() => bookingFare(120, 0)).toThrow();
  });

  it('prices a sub-segment by the share of the route ridden', () => {
    // Half the corridor costs half the fare.
    expect(bookingFare(120, 1, 0.5)).toBe(60);
    expect(bookingFare(120, 2, 0.5)).toBe(120);
  });

  it('charges the full fare end to end', () => {
    expect(bookingFare(120, 1, 1)).toBe(120);
  });

  it('applies the minimum fare floor to very short hops', () => {
    // 5% of the route still bills at the 25% floor, not Rs 6.
    expect(bookingFare(120, 1, 0.05)).toBe(30);
  });

  it('never bills beyond the whole route', () => {
    // A drop projecting past the end must not invent extra distance.
    expect(bookingFare(120, 1, 1.4)).toBe(120);
  });

  it('falls back to the full fare when the route fraction is unknown', () => {
    expect(bookingFare(120, 1, Number.NaN)).toBe(120);
    expect(bookingFare(120, 1)).toBe(120);
  });
});
