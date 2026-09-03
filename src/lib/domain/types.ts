import type { Database } from '@/types/database';

type Enums = Database['public']['Enums'];

export type SessionStatus = Enums['session_status'];
export type ParticipantStatus = Enums['participant_status'];
export type BookingStatus = Enums['booking_status'];
export type PaymentStatus = Enums['payment_status'];
export type RefundStatus = Enums['refund_status'];
export type HoldStatus = Enums['hold_status'];
export type WaitlistStatus = Enums['waitlist_status'];
export type AppRole = Enums['app_role'];
export type AvailabilityKind = Enums['availability_kind'];
export type VenueMemberRole = Enums['venue_member_role'];

/**
 * Refund terms an organizer sets when creating a session. Stored as JSON on
 * `sessions.cancellation_policy` so historical sessions keep the terms that
 * were in force when players paid.
 */
export type CancellationPolicy = {
  /** At or beyond this many hours before start, a cancelling player gets everything back. */
  fullRefundHoursBefore: number;
  /** At or beyond this many hours before start, they get `partialRefundPercent`. */
  partialRefundHoursBefore: number;
  /** Percentage returned in the partial window, 0–100. */
  partialRefundPercent: number;
  /** Inside this many hours before start, nothing is returned. */
  noRefundWithinHours: number;
  /** When the organizer or the platform cancels, players are made whole regardless of timing. */
  organizerCancelAlwaysFullRefund: boolean;
};

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  fullRefundHoursBefore: 48,
  partialRefundHoursBefore: 24,
  partialRefundPercent: 50,
  noRefundWithinHours: 24,
  organizerCancelAlwaysFullRefund: true,
};

/** Narrows the untyped jsonb column into a policy, falling back field by field. */
export function parseCancellationPolicy(value: unknown): CancellationPolicy {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_CANCELLATION_POLICY;
  }
  const raw = value as Record<string, unknown>;
  const num = (key: keyof CancellationPolicy, fallback: number): number => {
    const v = raw[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  };
  return {
    fullRefundHoursBefore: num(
      'fullRefundHoursBefore',
      DEFAULT_CANCELLATION_POLICY.fullRefundHoursBefore,
    ),
    partialRefundHoursBefore: num(
      'partialRefundHoursBefore',
      DEFAULT_CANCELLATION_POLICY.partialRefundHoursBefore,
    ),
    partialRefundPercent: Math.min(
      100,
      Math.max(0, num('partialRefundPercent', DEFAULT_CANCELLATION_POLICY.partialRefundPercent)),
    ),
    noRefundWithinHours: num(
      'noRefundWithinHours',
      DEFAULT_CANCELLATION_POLICY.noRefundWithinHours,
    ),
    organizerCancelAlwaysFullRefund:
      typeof raw.organizerCancelAlwaysFullRefund === 'boolean'
        ? raw.organizerCancelAlwaysFullRefund
        : DEFAULT_CANCELLATION_POLICY.organizerCancelAlwaysFullRefund,
  };
}
