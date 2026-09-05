import { Chip, type ChipTone } from '@/components/ui/primitives';
import {
  bookingStatusLabel,
  participantStatusLabel,
  paymentStatusLabel,
  refundStatusLabel,
  sessionStatusLabel,
  waitlistStatusLabel,
} from '@/i18n';
import type {
  BookingStatus,
  ParticipantStatus,
  PaymentStatus,
  RefundStatus,
  SessionStatus,
  WaitlistStatus,
} from '@/lib/domain/types';

/**
 * Status is the single most important thing on every screen in this product,
 * so the colour mapping lives in one place and never drifts between pages.
 */

const sessionTone: Record<SessionStatus, ChipTone> = {
  draft: 'neutral',
  open: 'info',
  ready_to_book: 'warning',
  holding_court: 'warning',
  booked: 'success',
  booking_failed: 'danger',
  cancelled: 'danger',
  completed: 'neutral',
};

const participantTone: Record<ParticipantStatus, ChipTone> = {
  joined_pending_payment: 'warning',
  paid_confirmed: 'success',
  cancelled: 'neutral',
  waitlisted: 'info',
  payment_expired: 'danger',
  refunded: 'neutral',
  joined_pay_later: 'warning',
  payment_overdue: 'danger',
};

const bookingTone: Record<BookingStatus, ChipTone> = {
  requested: 'warning',
  held: 'warning',
  confirmed: 'success',
  rejected: 'danger',
  expired: 'neutral',
  cancelled: 'neutral',
  failed: 'danger',
};

const paymentTone: Record<PaymentStatus, ChipTone> = {
  pending: 'warning',
  paid: 'success',
  failed: 'danger',
  refunded: 'info',
  expired: 'neutral',
};

const refundTone: Record<RefundStatus, ChipTone> = {
  pending: 'warning',
  processing: 'warning',
  completed: 'success',
  failed: 'danger',
};

const waitlistTone: Record<WaitlistStatus, ChipTone> = {
  waiting: 'info',
  promoted: 'warning',
  converted: 'success',
  expired: 'neutral',
  cancelled: 'neutral',
};

export const SessionStatusChip = ({ status }: { status: SessionStatus }) => (
  <Chip dot tone={sessionTone[status]}>
    {sessionStatusLabel[status]}
  </Chip>
);

export const ParticipantStatusChip = ({ status }: { status: ParticipantStatus }) => (
  <Chip dot tone={participantTone[status]}>
    {participantStatusLabel[status]}
  </Chip>
);

export const BookingStatusChip = ({ status }: { status: BookingStatus }) => (
  <Chip dot tone={bookingTone[status]}>
    {bookingStatusLabel[status]}
  </Chip>
);

export const PaymentStatusChip = ({ status }: { status: PaymentStatus }) => (
  <Chip dot tone={paymentTone[status]}>
    {paymentStatusLabel[status]}
  </Chip>
);

export const RefundStatusChip = ({ status }: { status: RefundStatus }) => (
  <Chip dot tone={refundTone[status]}>
    {refundStatusLabel[status]}
  </Chip>
);

export const WaitlistStatusChip = ({ status }: { status: WaitlistStatus }) => (
  <Chip dot tone={waitlistTone[status]}>
    {waitlistStatusLabel[status]}
  </Chip>
);
