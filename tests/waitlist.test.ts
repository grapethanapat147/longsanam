import { describe, expect, it } from 'vitest';
import {
  displayPosition,
  nextWaitlistPromotion,
  planWaitlistPromotion,
  type WaitlistEntry,
} from '@/lib/domain/waitlist';

const NOW = new Date('2026-03-10T10:00:00+07:00');
const STARTS = new Date('2026-03-12T19:00:00+07:00');

const entry = (
  id: string,
  position: number,
  status: WaitlistEntry['status'] = 'waiting',
  promotionExpiresAt?: Date,
): WaitlistEntry => ({ id, userId: `user-${id}`, position, status, promotionExpiresAt });

describe('planWaitlistPromotion', () => {
  it('promotes the lowest position first', () => {
    const plan = planWaitlistPromotion({
      entries: [entry('c', 3), entry('a', 1), entry('b', 2)],
      freeSlots: 1,
      paymentWindowMinutes: 60,
      sessionStartsAt: STARTS,
      now: NOW,
    });
    expect(plan.promotions).toHaveLength(1);
    expect(plan.promotions[0].entryId).toBe('a');
    expect(plan.remainingWaiting).toBe(2);
  });

  it('gives the promoted player the configured payment window', () => {
    const plan = planWaitlistPromotion({
      entries: [entry('a', 1)],
      freeSlots: 1,
      paymentWindowMinutes: 90,
      sessionStartsAt: STARTS,
      now: NOW,
    });
    expect(plan.promotions[0].expiresAt.getTime()).toBe(NOW.getTime() + 90 * 60_000);
  });

  it('never lets the payment window run past the session start', () => {
    const soon = new Date(NOW.getTime() + 20 * 60_000);
    const plan = planWaitlistPromotion({
      entries: [entry('a', 1)],
      freeSlots: 1,
      paymentWindowMinutes: 120,
      sessionStartsAt: soon,
      now: NOW,
    });
    expect(plan.promotions[0].expiresAt.getTime()).toBe(soon.getTime());
  });

  it('fills several slots at once when several open up', () => {
    const plan = planWaitlistPromotion({
      entries: [entry('a', 1), entry('b', 2), entry('c', 3)],
      freeSlots: 2,
      paymentWindowMinutes: 60,
      sessionStartsAt: STARTS,
      now: NOW,
    });
    expect(plan.promotions.map((p) => p.entryId)).toEqual(['a', 'b']);
    expect(plan.remainingWaiting).toBe(1);
  });

  it('counts an outstanding promotion as still occupying its slot', () => {
    const plan = planWaitlistPromotion({
      entries: [
        entry('a', 1, 'promoted', new Date(NOW.getTime() + 30 * 60_000)),
        entry('b', 2),
      ],
      freeSlots: 1,
      paymentWindowMinutes: 60,
      sessionStartsAt: STARTS,
      now: NOW,
    });
    expect(plan.promotions).toHaveLength(0);
    expect(plan.pendingPromotions).toBe(1);
    expect(plan.skippedReason).toBe('no_free_slot');
  });

  it('passes the slot down the queue once a promotion has expired', () => {
    const plan = planWaitlistPromotion({
      entries: [
        entry('a', 1, 'promoted', new Date(NOW.getTime() - 60_000)),
        entry('b', 2),
      ],
      freeSlots: 1,
      paymentWindowMinutes: 60,
      sessionStartsAt: STARTS,
      now: NOW,
    });
    expect(plan.pendingPromotions).toBe(0);
    expect(plan.promotions.map((p) => p.entryId)).toEqual(['b']);
  });

  it('does nothing when no slot is free', () => {
    const plan = planWaitlistPromotion({
      entries: [entry('a', 1)],
      freeSlots: 0,
      paymentWindowMinutes: 60,
      sessionStartsAt: STARTS,
      now: NOW,
    });
    expect(plan.promotions).toHaveLength(0);
    expect(plan.skippedReason).toBe('no_free_slot');
  });

  it('does nothing when the waitlist is empty', () => {
    const plan = planWaitlistPromotion({
      entries: [],
      freeSlots: 3,
      paymentWindowMinutes: 60,
      sessionStartsAt: STARTS,
      now: NOW,
    });
    expect(plan.skippedReason).toBe('waitlist_empty');
  });

  it('does not promote anyone after the session has started', () => {
    const plan = planWaitlistPromotion({
      entries: [entry('a', 1)],
      freeSlots: 2,
      paymentWindowMinutes: 60,
      sessionStartsAt: STARTS,
      now: new Date(STARTS.getTime() + 1000),
    });
    expect(plan.promotions).toHaveLength(0);
    expect(plan.skippedReason).toBe('session_started');
  });

  it('ignores cancelled and already-converted entries', () => {
    const plan = planWaitlistPromotion({
      entries: [entry('a', 1, 'cancelled'), entry('b', 2, 'converted'), entry('c', 3)],
      freeSlots: 2,
      paymentWindowMinutes: 60,
      sessionStartsAt: STARTS,
      now: NOW,
    });
    expect(plan.promotions.map((p) => p.entryId)).toEqual(['c']);
  });

  it('enforces a minimum payment window so a promotion is never instantly dead', () => {
    const plan = planWaitlistPromotion({
      entries: [entry('a', 1)],
      freeSlots: 1,
      paymentWindowMinutes: 0,
      sessionStartsAt: STARTS,
      now: NOW,
    });
    expect(plan.promotions[0].expiresAt.getTime()).toBe(NOW.getTime() + 5 * 60_000);
  });
});

describe('nextWaitlistPromotion', () => {
  it('returns just the first promotion', () => {
    const promotion = nextWaitlistPromotion({
      entries: [entry('a', 1), entry('b', 2)],
      freeSlots: 5,
      paymentWindowMinutes: 60,
      sessionStartsAt: STARTS,
      now: NOW,
    });
    expect(promotion?.entryId).toBe('a');
  });

  it('returns null when nobody can be promoted', () => {
    expect(
      nextWaitlistPromotion({
        entries: [],
        freeSlots: 1,
        paymentWindowMinutes: 60,
        sessionStartsAt: STARTS,
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe('displayPosition', () => {
  it('numbers the queue from one regardless of stored positions', () => {
    const entries = [entry('a', 5), entry('b', 9), entry('c', 12, 'cancelled')];
    expect(displayPosition(entries, 'a')).toBe(1);
    expect(displayPosition(entries, 'b')).toBe(2);
    expect(displayPosition(entries, 'c')).toBeNull();
  });
});
