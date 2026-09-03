import type { WaitlistStatus } from './types';

/**
 * Waitlist promotion.
 *
 * When a slot frees up the first waiting entry gets it, but only for a limited
 * window: an unclaimed promotion must expire so the slot can pass down the
 * queue rather than being held hostage by someone who has stopped reading
 * their notifications.
 */

export type WaitlistEntry = {
  id: string;
  userId: string;
  position: number;
  status: WaitlistStatus;
  promotionExpiresAt?: Date | string | null;
};

export type WaitlistPromotionInput = {
  entries: readonly WaitlistEntry[];
  /** Roster slots currently free. */
  freeSlots: number;
  paymentWindowMinutes: number;
  sessionStartsAt: Date | string;
  now?: Date;
};

export type WaitlistPromotion = {
  entryId: string;
  userId: string;
  position: number;
  /** The player must pay before this instant or the slot moves on. */
  expiresAt: Date;
};

export type WaitlistPlan = {
  promotions: WaitlistPromotion[];
  /** Promotions already outstanding that still occupy a slot. */
  pendingPromotions: number;
  /** Entries still waiting after this plan runs. */
  remainingWaiting: number;
  skippedReason?: 'no_free_slot' | 'waitlist_empty' | 'session_started';
};

const MINUTE_MS = 60_000;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function planWaitlistPromotion(input: WaitlistPromotionInput): WaitlistPlan {
  const now = input.now ?? new Date();
  const startsAt = toDate(input.sessionStartsAt);

  const waiting = input.entries
    .filter((e) => e.status === 'waiting')
    .slice()
    .sort((a, b) => a.position - b.position);

  // A promotion that has not expired yet is still holding its slot.
  const pendingPromotions = input.entries.filter(
    (e) =>
      e.status === 'promoted' &&
      (!e.promotionExpiresAt || toDate(e.promotionExpiresAt).getTime() > now.getTime()),
  ).length;

  const empty = (skippedReason: WaitlistPlan['skippedReason']): WaitlistPlan => ({
    promotions: [],
    pendingPromotions,
    remainingWaiting: waiting.length,
    skippedReason,
  });

  if (startsAt.getTime() <= now.getTime()) {
    return empty('session_started');
  }

  const claimableSlots = input.freeSlots - pendingPromotions;
  if (claimableSlots <= 0) {
    return empty('no_free_slot');
  }
  if (waiting.length === 0) {
    return empty('waitlist_empty');
  }

  // Never let a payment window run past the session itself.
  const windowEnd = new Date(now.getTime() + Math.max(5, input.paymentWindowMinutes) * MINUTE_MS);
  const expiresAt = windowEnd.getTime() < startsAt.getTime() ? windowEnd : startsAt;

  const promotions = waiting.slice(0, claimableSlots).map((entry) => ({
    entryId: entry.id,
    userId: entry.userId,
    position: entry.position,
    expiresAt,
  }));

  return {
    promotions,
    pendingPromotions,
    remainingWaiting: waiting.length - promotions.length,
  };
}

/** The single next promotion, which is what the cancellation flow needs. */
export function nextWaitlistPromotion(input: WaitlistPromotionInput): WaitlistPromotion | null {
  const plan = planWaitlistPromotion({
    ...input,
    freeSlots: Math.min(input.freeSlots, 1),
  });
  return plan.promotions[0] ?? null;
}

/** Position shown to a player, counting only people ahead of them. */
export function displayPosition(entries: readonly WaitlistEntry[], entryId: string): number | null {
  const waiting = entries
    .filter((e) => e.status === 'waiting' || e.status === 'promoted')
    .slice()
    .sort((a, b) => a.position - b.position);
  const index = waiting.findIndex((e) => e.id === entryId);
  return index === -1 ? null : index + 1;
}
