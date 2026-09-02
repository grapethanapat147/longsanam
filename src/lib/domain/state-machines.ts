import type { BookingStatus, ParticipantStatus, SessionStatus } from './types';

/**
 * The legal transitions for each aggregate. The database stores the current
 * state; these tables decide whether a proposed move is allowed at all, so an
 * illegal transition fails loudly instead of silently corrupting a session.
 */

export const SESSION_TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  draft: ['open', 'cancelled'],
  open: ['ready_to_book', 'cancelled', 'draft'],
  // Falling back to `open` covers a paid player cancelling and dropping the
  // session back below its minimum.
  ready_to_book: ['holding_court', 'open', 'cancelled'],
  holding_court: ['booked', 'booking_failed', 'cancelled'],
  booked: ['completed', 'cancelled'],
  // A failed attempt can be retried once the organizer adds another venue.
  booking_failed: ['holding_court', 'open', 'cancelled'],
  cancelled: [],
  completed: [],
};

export const PARTICIPANT_TRANSITIONS: Readonly<Record<ParticipantStatus, readonly ParticipantStatus[]>> = {
  joined_pending_payment: ['paid_confirmed', 'cancelled', 'payment_expired'],
  paid_confirmed: ['cancelled', 'refunded'],
  waitlisted: ['joined_pending_payment', 'cancelled'],
  payment_expired: ['joined_pending_payment', 'waitlisted', 'cancelled'],
  cancelled: ['joined_pending_payment', 'waitlisted'],
  refunded: [],
};

export const BOOKING_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  requested: ['held', 'confirmed', 'rejected', 'expired', 'cancelled', 'failed'],
  held: ['confirmed', 'rejected', 'expired', 'cancelled', 'failed'],
  confirmed: ['cancelled'],
  rejected: [],
  expired: [],
  cancelled: [],
  failed: [],
};

export const TERMINAL_SESSION_STATUSES: readonly SessionStatus[] = ['cancelled', 'completed'];
export const LIVE_BOOKING_STATUSES: readonly BookingStatus[] = ['requested', 'held', 'confirmed'];
/** Statuses that occupy a slot in the session roster. */
export const OCCUPYING_PARTICIPANT_STATUSES: readonly ParticipantStatus[] = [
  'joined_pending_payment',
  'paid_confirmed',
];

function check<T extends string>(
  table: Readonly<Record<T, readonly T[]>>,
  from: T,
  to: T,
): boolean {
  if (from === to) return true;
  return (table[from] ?? []).includes(to);
}

export const canTransitionSession = (from: SessionStatus, to: SessionStatus): boolean =>
  check(SESSION_TRANSITIONS, from, to);

export const canTransitionParticipant = (from: ParticipantStatus, to: ParticipantStatus): boolean =>
  check(PARTICIPANT_TRANSITIONS, from, to);

export const canTransitionBooking = (from: BookingStatus, to: BookingStatus): boolean =>
  check(BOOKING_TRANSITIONS, from, to);

export class IllegalTransitionError extends Error {
  constructor(
    readonly aggregate: 'session' | 'participant' | 'booking',
    readonly from: string,
    readonly to: string,
  ) {
    super(`ไม่สามารถเปลี่ยนสถานะ ${aggregate} จาก "${from}" เป็น "${to}" ได้`);
    this.name = 'IllegalTransitionError';
  }
}

export function assertSessionTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransitionSession(from, to)) {
    throw new IllegalTransitionError('session', from, to);
  }
}

export function assertParticipantTransition(from: ParticipantStatus, to: ParticipantStatus): void {
  if (!canTransitionParticipant(from, to)) {
    throw new IllegalTransitionError('participant', from, to);
  }
}

export function assertBookingTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransitionBooking(from, to)) {
    throw new IllegalTransitionError('booking', from, to);
  }
}

export const isSessionTerminal = (status: SessionStatus): boolean =>
  TERMINAL_SESSION_STATUSES.includes(status);

export const isBookingLive = (status: BookingStatus): boolean =>
  LIVE_BOOKING_STATUSES.includes(status);

export const participantOccupiesSlot = (status: ParticipantStatus): boolean =>
  OCCUPYING_PARTICIPANT_STATUSES.includes(status);
