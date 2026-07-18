import { describe, it, expect } from 'vitest';
import { TRIP_TRANSITIONS, TERMINAL_TRIP_STATES, type TripStatus } from '@syncroute/shared';
import { assertTransition } from './trip.service.js';

const ALL: TripStatus[] = [
  'booked',
  'started',
  'in_progress',
  'completed',
  'payment_pending',
  'payment_completed',
];

describe('trip state machine', () => {
  it('walks the full PS lifecycle end to end', () => {
    const happyPath: TripStatus[] = [
      'booked',
      'started',
      'in_progress',
      'completed',
      'payment_pending',
      'payment_completed',
    ];
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(() => assertTransition(happyPath[i], happyPath[i + 1])).not.toThrow();
    }
  });

  it('rejects every transition that is not explicitly allowed', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        if (TRIP_TRANSITIONS[from].includes(to)) continue;
        expect(() => assertTransition(from, to), `${from} -> ${to} should be rejected`).toThrow();
      }
    }
  });

  it('refuses to skip the trip and jump straight to paid', () => {
    expect(() => assertTransition('booked', 'payment_completed')).toThrow();
    expect(() => assertTransition('booked', 'completed')).toThrow();
  });

  it('refuses to reopen a settled trip', () => {
    for (const to of ALL) {
      expect(() => assertTransition('payment_completed', to)).toThrow();
    }
  });

  it('never allows a backwards move', () => {
    for (let i = 1; i < ALL.length; i++) {
      for (let j = 0; j < i; j++) {
        expect(() => assertTransition(ALL[i], ALL[j]), `${ALL[i]} -> ${ALL[j]}`).toThrow();
      }
    }
  });

  it('agrees with the terminal-state list the DB trigger enforces', () => {
    for (const s of TERMINAL_TRIP_STATES) {
      // A terminal state may only move along the payment path, never back
      // into an active state.
      const onward = TRIP_TRANSITIONS[s];
      expect(onward.every((t) => TERMINAL_TRIP_STATES.includes(t))).toBe(true);
    }
  });
});
