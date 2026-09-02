import { describe, expect, it } from 'vitest';
import {
  assertBookingTransition,
  assertParticipantTransition,
  assertSessionTransition,
  BOOKING_TRANSITIONS,
  canTransitionBooking,
  canTransitionParticipant,
  canTransitionSession,
  IllegalTransitionError,
  isBookingLive,
  isSessionTerminal,
  participantOccupiesSlot,
  PARTICIPANT_TRANSITIONS,
  SESSION_TRANSITIONS,
} from '@/lib/domain/state-machines';

describe('session state machine', () => {
  it('walks the happy path from draft to booked', () => {
    const path = ['draft', 'open', 'ready_to_book', 'holding_court', 'booked'] as const;
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransitionSession(path[i], path[i + 1])).toBe(true);
    }
  });

  it('supports the documented off-path states', () => {
    expect(canTransitionSession('holding_court', 'booking_failed')).toBe(true);
    expect(canTransitionSession('booking_failed', 'holding_court')).toBe(true);
    expect(canTransitionSession('booked', 'completed')).toBe(true);
    expect(canTransitionSession('open', 'cancelled')).toBe(true);
  });

  it('drops back to open when a payment is lost before booking', () => {
    expect(canTransitionSession('ready_to_book', 'open')).toBe(true);
  });

  it('refuses to skip the holding step', () => {
    expect(canTransitionSession('ready_to_book', 'booked')).toBe(false);
    expect(canTransitionSession('open', 'booked')).toBe(false);
  });

  it('treats cancelled and completed as terminal', () => {
    expect(SESSION_TRANSITIONS.cancelled).toHaveLength(0);
    expect(SESSION_TRANSITIONS.completed).toHaveLength(0);
    expect(canTransitionSession('cancelled', 'open')).toBe(false);
    expect(isSessionTerminal('cancelled')).toBe(true);
    expect(isSessionTerminal('booked')).toBe(false);
  });

  it('throws a typed error on an illegal move', () => {
    expect(() => assertSessionTransition('cancelled', 'open')).toThrow(IllegalTransitionError);
    expect(() => assertSessionTransition('draft', 'open')).not.toThrow();
  });

  it('treats a no-op transition as allowed so retries are safe', () => {
    expect(canTransitionSession('booked', 'booked')).toBe(true);
  });
});

describe('participant state machine', () => {
  it('walks the happy path', () => {
    expect(canTransitionParticipant('joined_pending_payment', 'paid_confirmed')).toBe(true);
  });

  it('supports the documented off-path states', () => {
    expect(canTransitionParticipant('joined_pending_payment', 'payment_expired')).toBe(true);
    expect(canTransitionParticipant('paid_confirmed', 'refunded')).toBe(true);
    expect(canTransitionParticipant('waitlisted', 'joined_pending_payment')).toBe(true);
  });

  it('does not confirm a player who never paid', () => {
    expect(canTransitionParticipant('payment_expired', 'paid_confirmed')).toBe(false);
    expect(canTransitionParticipant('waitlisted', 'paid_confirmed')).toBe(false);
  });

  it('lets an expired or cancelled player rejoin', () => {
    expect(canTransitionParticipant('payment_expired', 'joined_pending_payment')).toBe(true);
    expect(canTransitionParticipant('cancelled', 'joined_pending_payment')).toBe(true);
  });

  it('treats refunded as terminal', () => {
    expect(PARTICIPANT_TRANSITIONS.refunded).toHaveLength(0);
    expect(() => assertParticipantTransition('refunded', 'paid_confirmed')).toThrow(
      IllegalTransitionError,
    );
  });

  it('knows which statuses hold a roster slot', () => {
    expect(participantOccupiesSlot('joined_pending_payment')).toBe(true);
    expect(participantOccupiesSlot('paid_confirmed')).toBe(true);
    expect(participantOccupiesSlot('cancelled')).toBe(false);
    expect(participantOccupiesSlot('waitlisted')).toBe(false);
    expect(participantOccupiesSlot('payment_expired')).toBe(false);
  });
});

describe('booking state machine', () => {
  it('walks requested to held to confirmed', () => {
    expect(canTransitionBooking('requested', 'held')).toBe(true);
    expect(canTransitionBooking('held', 'confirmed')).toBe(true);
  });

  it('allows an auto-confirming venue to skip the held step', () => {
    expect(canTransitionBooking('requested', 'confirmed')).toBe(true);
  });

  it('supports the documented off-path states', () => {
    for (const to of ['rejected', 'expired', 'cancelled', 'failed'] as const) {
      expect(canTransitionBooking('requested', to)).toBe(true);
    }
  });

  it('cannot resurrect a rejected or expired booking', () => {
    expect(BOOKING_TRANSITIONS.rejected).toHaveLength(0);
    expect(BOOKING_TRANSITIONS.expired).toHaveLength(0);
    expect(() => assertBookingTransition('rejected', 'confirmed')).toThrow(IllegalTransitionError);
  });

  it('only allows a confirmed booking to be cancelled', () => {
    expect(canTransitionBooking('confirmed', 'cancelled')).toBe(true);
    expect(canTransitionBooking('confirmed', 'rejected')).toBe(false);
  });

  it('knows which statuses occupy a court', () => {
    expect(isBookingLive('requested')).toBe(true);
    expect(isBookingLive('held')).toBe(true);
    expect(isBookingLive('confirmed')).toBe(true);
    expect(isBookingLive('rejected')).toBe(false);
    expect(isBookingLive('expired')).toBe(false);
    expect(isBookingLive('cancelled')).toBe(false);
  });
});
