/**
 * Credit arithmetic and the post-session chase schedule.
 *
 * These numbers are chosen, not derived — see the open questions on LSN-0019.
 * They live here as pure functions so the rules are stated once and pinned by
 * tests, rather than being reimplemented in SQL where nothing checks them.
 *
 * The eligibility threshold and the 0–100 clamp do also appear in SQL, and that
 * duplication is deliberate: this copy decides what the organizer's UI offers,
 * the SQL copy is the security boundary a forged request still hits.
 */

export const CREDIT_MAX = 100;
export const CREDIT_FLOOR = 0;
export const CREDIT_START = 100;
export const PAY_LATER_MIN_SCORE = 70;

/** Days after the session ends before credit starts falling. */
export const GRACE_DAYS = 3;
/** Day at which reminders and credit decay both stop. */
export const CHASE_STOP_DAY = 14;

export const CREDIT_PER_OVERDUE_DAY = -5;
export const CREDIT_PAID_IN_GRACE = 5;
export const CREDIT_SETTLED_LATE = 10;

export function applyDelta(score: number, delta: number): number {
  return Math.min(CREDIT_MAX, Math.max(CREDIT_FLOOR, score + delta));
}

/**
 * The credit charged for one whole day of being overdue. Zero inside the grace
 * window and zero again once chasing stops — past that point the score has said
 * what it has to say, and grinding it lower changes nobody's behaviour.
 */
export function creditDeltaForOverdueDay(dayIndex: number): number {
  if (dayIndex < GRACE_DAYS) return 0;
  if (dayIndex >= CHASE_STOP_DAY) return 0;
  return CREDIT_PER_OVERDUE_DAY;
}

export function isPayLaterEligible(score: number): boolean {
  return score >= PAY_LATER_MIN_SCORE;
}

/** Chasing begins two hours after the session ends, not the moment it does. */
export const CHASE_START_HOURS = 2;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Zero on the first chase, then one per whole elapsed day. -1 before it starts. */
export function overdueDayIndex(endsAt: Date, now: Date): number {
  const start = endsAt.getTime() + CHASE_START_HOURS * HOUR_MS;
  if (now.getTime() < start) return -1;
  return Math.floor((now.getTime() - start) / DAY_MS);
}

export type ChaseInput = { endsAt: Date; lastChasedAt: Date | null; now: Date };
export type ChaseDecision = { shouldChase: boolean; dayIndex: number; creditDelta: number };

/**
 * Whether this participant is due a reminder right now.
 *
 * The sweep runs every five minutes, so the guard that matters is not "is it
 * time" but "have we already sent today's". `lastChasedAt` carries that, which
 * is why the decision is a function of it rather than of the clock alone.
 */
export function chaseDecision({ endsAt, lastChasedAt, now }: ChaseInput): ChaseDecision {
  const dayIndex = overdueDayIndex(endsAt, now);
  const idle: ChaseDecision = { shouldChase: false, dayIndex, creditDelta: 0 };

  if (dayIndex < 0) return idle;
  if (dayIndex >= CHASE_STOP_DAY) return idle;
  if (lastChasedAt && overdueDayIndex(endsAt, lastChasedAt) >= dayIndex) return idle;

  return { shouldChase: true, dayIndex, creditDelta: creditDeltaForOverdueDay(dayIndex) };
}

/**
 * Attendance.
 *
 * The window closes where the chase opens (`CHASE_START_HOURS`), so there is
 * never a moment when someone is being reminded about a debt whose attendance
 * the organizer could still be recording.
 */

export const CHECK_IN_OPENS_MINUTES_BEFORE = 30;

/**
 * What a pay-later seat that never came and never cancelled costs.
 *
 * The charge itself is applied by mark_no_shows() in SQL, inside the sweep's
 * transaction. This constant names the number and is what the parity check in
 * the ticket greps against; it is documentation with a test, not a second
 * implementation.
 */
export const CREDIT_NO_SHOW_UNPAID = -10;

export type CheckInWindow = {
  opensAt: Date;
  closesAt: Date;
  isOpenAt: (now: Date) => boolean;
};

export function checkInWindow(startsAt: Date, endsAt: Date): CheckInWindow {
  const opensAt = new Date(startsAt.getTime() - CHECK_IN_OPENS_MINUTES_BEFORE * 60 * 1000);
  const closesAt = new Date(endsAt.getTime() + CHASE_START_HOURS * 60 * 60 * 1000);
  return {
    opensAt,
    closesAt,
    isOpenAt: (now) => now >= opensAt && now < closesAt,
  };
}
