import { describe, expect, it } from 'vitest';
import {
  costPerPersonThb,
  evaluateBookingEligibility,
  remainingSlots,
  type BookingEligibilityInput,
} from '@/lib/domain/booking-eligibility';

const NOW = new Date('2026-03-10T10:00:00+07:00');
const STARTS = new Date('2026-03-12T19:00:00+07:00');

function input(overrides: Partial<BookingEligibilityInput> = {}): BookingEligibilityInput {
  return {
    status: 'ready_to_book',
    minPlayers: 6,
    targetPlayers: 8,
    paidParticipants: 6,
    paidTotalThb: 600,
    requiredTotalThb: 600,
    startsAt: STARTS,
    approvedPreferenceCount: 2,
    now: NOW,
    ...overrides,
  };
}

describe('evaluateBookingEligibility', () => {
  it('books when both the headcount and the money thresholds are met', () => {
    const result = evaluateBookingEligibility(input());
    expect(result.eligible).toBe(true);
  });

  it('blocks when enough money arrived but not enough players did', () => {
    const result = evaluateBookingEligibility(
      input({ paidParticipants: 4, paidTotalThb: 1000, requiredTotalThb: 600 }),
    );
    expect(result).toMatchObject({
      eligible: false,
      reason: 'below_min_players',
      missingPlayers: 2,
    });
  });

  it('blocks when enough players joined but the collected total falls short', () => {
    const result = evaluateBookingEligibility(
      input({ paidParticipants: 6, paidTotalThb: 500, requiredTotalThb: 600 }),
    );
    expect(result).toMatchObject({
      eligible: false,
      reason: 'below_required_total',
      shortfallThb: 100,
    });
  });

  it('treats the minimum as inclusive', () => {
    expect(evaluateBookingEligibility(input({ paidParticipants: 6 })).eligible).toBe(true);
    expect(evaluateBookingEligibility(input({ paidParticipants: 5, paidTotalThb: 600 })).eligible).toBe(
      false,
    );
  });

  it('refuses to book a session with no approved venue', () => {
    expect(evaluateBookingEligibility(input({ approvedPreferenceCount: 0 }))).toMatchObject({
      eligible: false,
      reason: 'no_approved_venue',
    });
  });

  it('refuses once the session start time has passed', () => {
    expect(
      evaluateBookingEligibility(input({ now: new Date('2026-03-12T20:00:00+07:00') })),
    ).toMatchObject({ eligible: false, reason: 'session_started' });
  });

  it.each([
    ['draft', 'session_not_ready'],
    ['open', 'session_not_ready'],
    ['holding_court', 'session_not_ready'],
    ['booked', 'already_booked'],
    ['cancelled', 'session_terminal'],
    ['completed', 'session_terminal'],
  ] as const)('does not book a %s session', (status, reason) => {
    expect(evaluateBookingEligibility(input({ status }))).toMatchObject({
      eligible: false,
      reason,
    });
  });

  it('retries a session whose previous booking attempt failed', () => {
    expect(evaluateBookingEligibility(input({ status: 'booking_failed' })).eligible).toBe(true);
  });

  it('accepts a surplus of players and money', () => {
    expect(
      evaluateBookingEligibility(input({ paidParticipants: 8, paidTotalThb: 900 })).eligible,
    ).toBe(true);
  });
});

describe('remainingSlots', () => {
  it('never reports a negative number of slots', () => {
    expect(remainingSlots(8, 3)).toBe(5);
    expect(remainingSlots(8, 8)).toBe(0);
    expect(remainingSlots(8, 11)).toBe(0);
  });
});

describe('costPerPersonThb', () => {
  it('rounds up so the court is always fully covered', () => {
    expect(costPerPersonThb(1000, 3)).toBe(334);
    expect(costPerPersonThb(1000, 3) * 3).toBeGreaterThanOrEqual(1000);
  });

  it('returns zero rather than dividing by zero', () => {
    expect(costPerPersonThb(1000, 0)).toBe(0);
  });
});
