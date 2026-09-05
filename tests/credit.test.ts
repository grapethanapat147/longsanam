import { describe, expect, it } from 'vitest';
import {
  CREDIT_FLOOR,
  CREDIT_MAX,
  PAY_LATER_MIN_SCORE,
  applyDelta,
  chaseDecision,
  creditDeltaForOverdueDay,
  isPayLaterEligible,
  overdueDayIndex,
} from '@/lib/domain/credit';

describe('applyDelta', () => {
  it('caps at the maximum', () => {
    expect(applyDelta(98, 10)).toBe(CREDIT_MAX);
  });

  it('floors at zero rather than going negative', () => {
    expect(applyDelta(3, -5)).toBe(CREDIT_FLOOR);
  });

  it('leaves a score untouched for a zero delta', () => {
    expect(applyDelta(70, 0)).toBe(70);
  });
});

describe('creditDeltaForOverdueDay', () => {
  it('charges nothing inside the three-day grace window', () => {
    expect(creditDeltaForOverdueDay(0)).toBe(0);
    expect(creditDeltaForOverdueDay(2)).toBe(0);
  });

  it('charges five per day from day three', () => {
    expect(creditDeltaForOverdueDay(3)).toBe(-5);
    expect(creditDeltaForOverdueDay(13)).toBe(-5);
  });

  it('stops charging once reminders stop at day fourteen', () => {
    expect(creditDeltaForOverdueDay(14)).toBe(0);
    expect(creditDeltaForOverdueDay(90)).toBe(0);
  });
});

describe('isPayLaterEligible', () => {
  it('admits a score at the threshold', () => {
    expect(isPayLaterEligible(PAY_LATER_MIN_SCORE)).toBe(true);
  });

  it('refuses one point below', () => {
    expect(isPayLaterEligible(PAY_LATER_MIN_SCORE - 1)).toBe(false);
  });
});

const ENDS = new Date('2026-09-01T12:00:00Z');
const at = (iso: string) => new Date(iso);

describe('overdueDayIndex', () => {
  it('is negative before the two-hour mark', () => {
    expect(overdueDayIndex(ENDS, at('2026-09-01T13:00:00Z'))).toBe(-1);
  });

  it('is zero from the two-hour mark until the first day elapses', () => {
    expect(overdueDayIndex(ENDS, at('2026-09-01T14:00:00Z'))).toBe(0);
    expect(overdueDayIndex(ENDS, at('2026-09-02T13:59:00Z'))).toBe(0);
  });

  it('advances one per whole day after that', () => {
    expect(overdueDayIndex(ENDS, at('2026-09-02T14:00:00Z'))).toBe(1);
    expect(overdueDayIndex(ENDS, at('2026-09-04T14:00:00Z'))).toBe(3);
  });
});

describe('chaseDecision', () => {
  it('does nothing before the two-hour mark', () => {
    const d = chaseDecision({ endsAt: ENDS, lastChasedAt: null, now: at('2026-09-01T13:00:00Z') });
    expect(d.shouldChase).toBe(false);
  });

  it('sends the first reminder at the two-hour mark with no credit charge', () => {
    const d = chaseDecision({ endsAt: ENDS, lastChasedAt: null, now: at('2026-09-01T14:00:00Z') });
    expect(d.shouldChase).toBe(true);
    expect(d.creditDelta).toBe(0);
    expect(d.dayIndex).toBe(0);
  });

  it('is idempotent: a second sweep in the same day sends nothing', () => {
    const d = chaseDecision({
      endsAt: ENDS,
      lastChasedAt: at('2026-09-01T14:00:00Z'),
      now: at('2026-09-01T14:05:00Z'),
    });
    expect(d.shouldChase).toBe(false);
  });

  it('charges credit once the grace window has passed', () => {
    const d = chaseDecision({
      endsAt: ENDS,
      lastChasedAt: at('2026-09-03T14:00:00Z'),
      now: at('2026-09-04T14:00:00Z'),
    });
    expect(d.shouldChase).toBe(true);
    expect(d.dayIndex).toBe(3);
    expect(d.creditDelta).toBe(-5);
  });

  it('stops entirely at day fourteen', () => {
    const d = chaseDecision({
      endsAt: ENDS,
      lastChasedAt: at('2026-09-14T14:00:00Z'),
      now: at('2026-09-16T14:00:00Z'),
    });
    expect(d.shouldChase).toBe(false);
  });
});
