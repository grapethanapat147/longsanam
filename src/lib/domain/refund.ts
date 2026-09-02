import type { CancellationPolicy, SessionStatus } from './types';

/**
 * Refund calculation.
 *
 * The amount is always derived here and then clamped again in the database, so
 * neither a stale browser nor a bug in this file can pay out more than the
 * player actually paid.
 */

export type RefundInitiator = 'player' | 'organizer' | 'platform';

export type RefundInput = {
  policy: CancellationPolicy;
  /** Baht the player actually paid. The refund can never exceed this. */
  paidAmountThb: number;
  sessionStartsAt: Date | string;
  sessionStatus: SessionStatus;
  initiatedBy: RefundInitiator;
  now?: Date;
};

export type RefundRule =
  | 'nothing_paid'
  | 'session_cancelled_by_organizer'
  | 'booking_failed'
  | 'full_refund_window'
  | 'partial_refund_window'
  | 'no_refund_window'
  | 'after_start';

export type RefundResult = {
  refundThb: number;
  percent: number;
  rule: RefundRule;
  hoursBeforeStart: number;
};

const MS_PER_HOUR = 3_600_000;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function hoursUntil(target: Date | string, now: Date): number {
  return (toDate(target).getTime() - now.getTime()) / MS_PER_HOUR;
}

function settle(
  paidAmountThb: number,
  percent: number,
  rule: RefundRule,
  hoursBeforeStart: number,
): RefundResult {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const raw = Math.round((paidAmountThb * clampedPercent) / 100);
  return {
    refundThb: Math.min(Math.max(0, raw), Math.max(0, paidAmountThb)),
    percent: clampedPercent,
    rule,
    hoursBeforeStart,
  };
}

export function calculateRefund(input: RefundInput): RefundResult {
  const now = input.now ?? new Date();
  const hoursBeforeStart = hoursUntil(input.sessionStartsAt, now);
  const paid = Math.max(0, Math.trunc(input.paidAmountThb));

  if (paid === 0) {
    return settle(0, 0, 'nothing_paid', hoursBeforeStart);
  }

  // The platform never keeps a player's money for a session that could not be
  // held up on its side of the bargain.
  if (input.sessionStatus === 'booking_failed') {
    return settle(paid, 100, 'booking_failed', hoursBeforeStart);
  }

  if (
    (input.initiatedBy === 'organizer' || input.initiatedBy === 'platform') &&
    input.policy.organizerCancelAlwaysFullRefund
  ) {
    return settle(paid, 100, 'session_cancelled_by_organizer', hoursBeforeStart);
  }

  if (hoursBeforeStart <= 0) {
    return settle(paid, 0, 'after_start', hoursBeforeStart);
  }

  if (hoursBeforeStart >= input.policy.fullRefundHoursBefore) {
    return settle(paid, 100, 'full_refund_window', hoursBeforeStart);
  }

  if (hoursBeforeStart >= input.policy.partialRefundHoursBefore) {
    return settle(paid, input.policy.partialRefundPercent, 'partial_refund_window', hoursBeforeStart);
  }

  return settle(paid, 0, 'no_refund_window', hoursBeforeStart);
}

/**
 * Whether a player may still release their slot at all. Cancelling is always
 * permitted before the session starts; what changes is how much comes back.
 */
export function canPlayerCancel(sessionStartsAt: Date | string, now: Date = new Date()): boolean {
  return hoursUntil(sessionStartsAt, now) > 0;
}

/** Plain-language summary of a policy, for the session page. */
export function describePolicy(policy: CancellationPolicy): string[] {
  return [
    `ยกเลิกก่อนเริ่มอย่างน้อย ${policy.fullRefundHoursBefore} ชั่วโมง คืนเงินเต็มจำนวน`,
    `ยกเลิกก่อนเริ่ม ${policy.partialRefundHoursBefore}–${policy.fullRefundHoursBefore} ชั่วโมง คืนเงิน ${policy.partialRefundPercent}%`,
    `ยกเลิกภายใน ${policy.noRefundWithinHours} ชั่วโมงก่อนเริ่ม ไม่คืนเงิน`,
    policy.organizerCancelAlwaysFullRefund
      ? 'หากผู้จัดยกเลิกก๊วน หรือระบบจองสนามไม่สำเร็จ คืนเงินเต็มจำนวนทุกกรณี'
      : 'หากผู้จัดยกเลิกก๊วน คืนเงินตามเงื่อนไขเวลาข้างต้น',
  ];
}
