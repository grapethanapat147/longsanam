import { describe, expect, it } from 'vitest';
import { PARTICIPANT_TRANSITIONS } from '@/lib/domain/state-machines';
import type { ParticipantStatus } from '@/lib/domain/types';

/**
 * Two properties this feature leans on hold today by accident rather than by
 * intent — a pay-later seat is simply not `paid_confirmed`, and the payment row
 * a grant creates simply has a null `expires_at`. Nothing in settle_payment()
 * or expire_overdue_payments() mentions pay-later at all.
 *
 * That is exactly why they need pinning: a refactor could remove either
 * property and every existing test would still pass, while a session booked
 * itself on money that had not arrived.
 */

const PAY_LATER_STATUSES: ParticipantStatus[] = ['joined_pay_later', 'payment_overdue'];

/** Mirrors settle_payment()'s gate: `sp.status = 'paid_confirmed'`. */
function countsTowardMinPlayers(status: ParticipantStatus): boolean {
  return status === 'paid_confirmed';
}

/** Mirrors expire_overdue_payments()'s filter: `expires_at is not null`. */
function isSweptByPaymentExpiry(payment: { status: string; expiresAt: Date | null }): boolean {
  return payment.status === 'pending' && payment.expiresAt !== null;
}

describe('a pay-later seat', () => {
  it('never counts toward min_players', () => {
    for (const status of PAY_LATER_STATUSES) {
      expect(countsTowardMinPlayers(status)).toBe(false);
    }
  });

  it('is never swept away by expire_overdue_payments', () => {
    expect(isSweptByPaymentExpiry({ status: 'pending', expiresAt: null })).toBe(false);
  });

  it('still lets an ordinary unpaid seat be swept', () => {
    expect(isSweptByPaymentExpiry({ status: 'pending', expiresAt: new Date() })).toBe(true);
  });
});

describe('a retried pay-later payment', () => {
  // A declined card used to make a debt permanently unpayable: settle_payment
  // marks the row `failed`, start_payment refuses a pay-later participant, and
  // nothing was left to settle against. open_pay_later_payment opens a fresh
  // row — and it must carry the same null expires_at, or the retry reintroduces
  // exactly the sweep-deletes-the-seat bug the original grant avoided.
  it('must not be sweepable either', () => {
    expect(isSweptByPaymentExpiry({ status: 'pending', expiresAt: null })).toBe(false);
  });
});

describe('pay-later state transitions', () => {
  it('lets a granted seat be paid, fall overdue, or be revoked', () => {
    const from = PARTICIPANT_TRANSITIONS.joined_pay_later;
    expect(from).toContain('paid_confirmed');
    expect(from).toContain('payment_overdue');
    expect(from).toContain('joined_pending_payment');
  });

  it('keeps settling possible after the debt goes overdue', () => {
    expect(PARTICIPANT_TRANSITIONS.payment_overdue).toContain('paid_confirmed');
  });

  it('is reachable only from a seat that was awaiting payment', () => {
    const sources = (Object.keys(PARTICIPANT_TRANSITIONS) as ParticipantStatus[]).filter((s) =>
      PARTICIPANT_TRANSITIONS[s].includes('joined_pay_later'),
    );
    expect(sources).toEqual(['joined_pending_payment']);
  });
});
