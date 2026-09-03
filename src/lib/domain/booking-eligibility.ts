import type { SessionStatus } from './types';

/**
 * A session becomes bookable only when BOTH thresholds clear: enough players
 * have paid, and enough money has actually landed to cover the court. Counting
 * players alone would let a session with a discounted or partially refunded
 * roster trigger a booking the organizer cannot pay for.
 */

export type BookingEligibilityInput = {
  status: SessionStatus;
  /** Minimum players the organizer will run the session with. */
  minPlayers: number;
  targetPlayers: number;
  /** Players whose payment has settled. */
  paidParticipants: number;
  /** Baht actually collected. */
  paidTotalThb: number;
  /** Baht the cheapest approved court will cost. */
  requiredTotalThb: number;
  startsAt: Date | string;
  /** Approved fallback options; zero means there is nothing legal to book. */
  approvedPreferenceCount: number;
  now?: Date;
};

export type BookingBlockedReason =
  | 'session_not_ready'
  | 'session_terminal'
  | 'already_booked'
  | 'session_started'
  | 'no_approved_venue'
  | 'below_min_players'
  | 'below_required_total';

export type BookingEligibility =
  | {
      eligible: true;
      paidParticipants: number;
      paidTotalThb: number;
      shortfallThb: 0;
    }
  | {
      eligible: false;
      reason: BookingBlockedReason;
      /** Players still needed. Zero when the block is not about headcount. */
      missingPlayers: number;
      /** Baht still needed. Zero when the block is not about money. */
      shortfallThb: number;
    };

const READY_STATUSES: readonly SessionStatus[] = ['ready_to_book', 'booking_failed'];

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function evaluateBookingEligibility(input: BookingEligibilityInput): BookingEligibility {
  const now = input.now ?? new Date();
  const blocked = (
    reason: BookingBlockedReason,
    missingPlayers = 0,
    shortfallThb = 0,
  ): BookingEligibility => ({
    eligible: false,
    reason,
    missingPlayers,
    shortfallThb,
  });

  if (input.status === 'cancelled' || input.status === 'completed') {
    return blocked('session_terminal');
  }
  if (input.status === 'booked') {
    return blocked('already_booked');
  }
  if (!READY_STATUSES.includes(input.status)) {
    // Draft, open and holding_court all mean "not this moment".
    return blocked(
      'session_not_ready',
      Math.max(0, input.minPlayers - input.paidParticipants),
      Math.max(0, input.requiredTotalThb - input.paidTotalThb),
    );
  }
  if (toDate(input.startsAt).getTime() <= now.getTime()) {
    return blocked('session_started');
  }
  if (input.approvedPreferenceCount <= 0) {
    return blocked('no_approved_venue');
  }

  const missingPlayers = Math.max(0, input.minPlayers - input.paidParticipants);
  if (missingPlayers > 0) {
    return blocked(
      'below_min_players',
      missingPlayers,
      Math.max(0, input.requiredTotalThb - input.paidTotalThb),
    );
  }

  const shortfallThb = Math.max(0, input.requiredTotalThb - input.paidTotalThb);
  if (shortfallThb > 0) {
    return blocked('below_required_total', 0, shortfallThb);
  }

  return {
    eligible: true,
    paidParticipants: input.paidParticipants,
    paidTotalThb: input.paidTotalThb,
    shortfallThb: 0,
  };
}

/** Slots still open on the roster, never negative. */
export function remainingSlots(targetPlayers: number, occupiedParticipants: number): number {
  return Math.max(0, targetPlayers - occupiedParticipants);
}

/**
 * What each player owes. The organizer sets a budget per person, but the real
 * cost is the court price split across the players who will actually pay.
 */
export function costPerPersonThb(courtPriceThb: number, payingPlayers: number): number {
  if (payingPlayers <= 0) return 0;
  return Math.ceil(courtPriceThb / payingPlayers);
}
