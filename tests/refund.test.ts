import { describe, expect, it } from 'vitest';
import { calculateRefund, canPlayerCancel, type RefundInput } from '@/lib/domain/refund';
import { DEFAULT_CANCELLATION_POLICY, parseCancellationPolicy } from '@/lib/domain/types';

const STARTS = new Date('2026-03-12T19:00:00+07:00');
const hoursBefore = (h: number) => new Date(STARTS.getTime() - h * 3_600_000);

function input(overrides: Partial<RefundInput> = {}): RefundInput {
  return {
    policy: DEFAULT_CANCELLATION_POLICY,
    paidAmountThb: 200,
    sessionStartsAt: STARTS,
    sessionStatus: 'open',
    initiatedBy: 'player',
    now: hoursBefore(72),
    ...overrides,
  };
}

describe('calculateRefund', () => {
  it('returns everything when cancelling well before the deadline', () => {
    expect(calculateRefund(input({ now: hoursBefore(72) }))).toMatchObject({
      refundThb: 200,
      percent: 100,
      rule: 'full_refund_window',
    });
  });

  it('treats the full-refund boundary as inclusive', () => {
    expect(calculateRefund(input({ now: hoursBefore(48) })).refundThb).toBe(200);
    expect(calculateRefund(input({ now: hoursBefore(47.9) })).refundThb).toBe(100);
  });

  it('returns the partial percentage inside the middle window', () => {
    expect(calculateRefund(input({ now: hoursBefore(30) }))).toMatchObject({
      refundThb: 100,
      percent: 50,
      rule: 'partial_refund_window',
    });
  });

  it('treats the partial boundary as inclusive', () => {
    expect(calculateRefund(input({ now: hoursBefore(24) })).refundThb).toBe(100);
    expect(calculateRefund(input({ now: hoursBefore(23.9) })).refundThb).toBe(0);
  });

  it('returns nothing inside the no-refund window', () => {
    expect(calculateRefund(input({ now: hoursBefore(2) }))).toMatchObject({
      refundThb: 0,
      rule: 'no_refund_window',
    });
  });

  it('returns nothing once the session has started', () => {
    expect(calculateRefund(input({ now: new Date(STARTS.getTime() + 60_000) }))).toMatchObject({
      refundThb: 0,
      rule: 'after_start',
    });
  });

  it('makes players whole when the organizer cancels, however late', () => {
    expect(
      calculateRefund(input({ initiatedBy: 'organizer', now: hoursBefore(1) })),
    ).toMatchObject({ refundThb: 200, percent: 100, rule: 'session_cancelled_by_organizer' });
  });

  it('honours a policy that does not guarantee refunds on organizer cancellation', () => {
    const policy = { ...DEFAULT_CANCELLATION_POLICY, organizerCancelAlwaysFullRefund: false };
    expect(
      calculateRefund(input({ policy, initiatedBy: 'organizer', now: hoursBefore(1) })).refundThb,
    ).toBe(0);
  });

  it('makes players whole when the platform could not secure a court', () => {
    expect(
      calculateRefund(input({ sessionStatus: 'booking_failed', now: hoursBefore(1) })),
    ).toMatchObject({ refundThb: 200, rule: 'booking_failed' });
  });

  it('refunds nothing to a player who never paid', () => {
    expect(calculateRefund(input({ paidAmountThb: 0 }))).toMatchObject({
      refundThb: 0,
      rule: 'nothing_paid',
    });
  });

  it('never refunds more than was paid', () => {
    const policy = { ...DEFAULT_CANCELLATION_POLICY, partialRefundPercent: 500 };
    const result = calculateRefund(input({ policy, now: hoursBefore(30) }));
    expect(result.refundThb).toBe(200);
    expect(result.refundThb).toBeLessThanOrEqual(200);
  });

  it('never returns a negative amount', () => {
    const policy = { ...DEFAULT_CANCELLATION_POLICY, partialRefundPercent: -50 };
    expect(calculateRefund(input({ policy, now: hoursBefore(30) })).refundThb).toBe(0);
  });

  it('produces whole baht only', () => {
    const policy = { ...DEFAULT_CANCELLATION_POLICY, partialRefundPercent: 33 };
    const result = calculateRefund(input({ policy, paidAmountThb: 175, now: hoursBefore(30) }));
    expect(Number.isInteger(result.refundThb)).toBe(true);
    expect(result.refundThb).toBe(58);
  });
});

describe('canPlayerCancel', () => {
  it('allows cancelling right up to the start', () => {
    expect(canPlayerCancel(STARTS, hoursBefore(0.1))).toBe(true);
    expect(canPlayerCancel(STARTS, new Date(STARTS.getTime() + 1))).toBe(false);
  });
});

describe('parseCancellationPolicy', () => {
  it('falls back to defaults for malformed input', () => {
    expect(parseCancellationPolicy(null)).toEqual(DEFAULT_CANCELLATION_POLICY);
    expect(parseCancellationPolicy('nope')).toEqual(DEFAULT_CANCELLATION_POLICY);
  });

  it('keeps valid fields and repairs invalid ones', () => {
    const parsed = parseCancellationPolicy({
      fullRefundHoursBefore: 12,
      partialRefundPercent: 999,
      organizerCancelAlwaysFullRefund: 'yes',
    });
    expect(parsed.fullRefundHoursBefore).toBe(12);
    expect(parsed.partialRefundPercent).toBe(100);
    expect(parsed.organizerCancelAlwaysFullRefund).toBe(true);
  });
});
