'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  cancelParticipationAction,
  joinSessionAction,
  leaveWaitlistAction,
  payForSlotAction,
} from '@/lib/actions/participation';
import { Alert, Button, Card, Chip, DisabledAction } from '@/components/ui/primitives';
import { ParticipantStatusChip, WaitlistStatusChip } from '@/components/status';
import { formatCountdown, formatThb } from '@/lib/format';
import { t } from '@/i18n';
import type { ParticipantStatus, SessionStatus, WaitlistStatus } from '@/lib/domain/types';

type Participant = {
  id: string;
  status: ParticipantStatus;
  amount_due_thb: number;
  payment_due_at: string;
};

type WaitlistEntry = {
  id: string;
  position: number;
  status: WaitlistStatus;
  promotion_expires_at: string | null;
};

type Props = {
  sessionId: string;
  publicCode: string;
  status: SessionStatus;
  slotsLeft: number;
  amountThb: number;
  paymentDeadline: string;
  startsAt: string;
  isSignedIn: boolean;
  participant: Participant | null;
  waitlistEntry: WaitlistEntry | null;
  /** Computed on the server so the rendered branch cannot drift between renders. */
  deadlinePassed: boolean;
  sessionStarted: boolean;
  participantPaymentOverdue: boolean;
};

type Feedback = {
  tone: 'success' | 'danger' | 'info' | 'warning';
  text: string;
} | null;

const JOINABLE: SessionStatus[] = ['open', 'ready_to_book', 'holding_court'];

/**
 * The join/pay/cancel panel.
 *
 * Every branch here either renders a control that genuinely works, or a
 * disabled control that states why. Nothing reports success unless the server
 * action confirmed it.
 */
export function JoinPanel(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const { deadlinePassed, sessionStarted: started } = props;

  function run(fn: () => Promise<Feedback>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await fn();
      setFeedback(result);
      router.refresh();
    });
  }

  const handleJoin = () =>
    run(async () => {
      const result = await joinSessionAction(props.sessionId);
      if (!result.ok) return { tone: 'danger', text: result.error };
      if (result.outcome === 'waitlisted') {
        return {
          tone: 'info',
          text: `เข้าคิวสำรองแล้ว ลำดับที่ ${result.position}`,
        };
      }
      return {
        tone: 'success',
        text: 'เข้าร่วมแล้ว กรุณาชำระเงินเพื่อยืนยันที่นั่ง',
      };
    });

  const handlePay = (participantId: string) =>
    run(async () => {
      const result = await payForSlotAction(participantId);
      if (!result.ok) return { tone: 'danger', text: result.error };
      if (result.booked) {
        return {
          tone: 'success',
          text: 'ชำระเงินสำเร็จ และระบบจองสนามให้เรียบร้อยแล้ว',
        };
      }
      if (result.bookingOutcome === 'awaiting_venue') {
        return {
          tone: 'success',
          text: 'ชำระเงินสำเร็จ ระบบส่งคำขอจองแล้ว กำลังรอสนามยืนยัน',
        };
      }
      if (result.bookingOutcome === 'failed') {
        return {
          tone: 'warning',
          text: 'ชำระเงินสำเร็จ แต่ระบบยังจองสนามไม่ได้ ผู้จัดจะได้รับแจ้งเพื่อหาสนามเพิ่ม',
        };
      }
      return { tone: 'success', text: t.payment.succeeded };
    });

  const handleCancel = (participantId: string) =>
    run(async () => {
      const result = await cancelParticipationAction(participantId);
      setConfirmingCancel(false);
      if (!result.ok) return { tone: 'danger', text: result.error };

      // The slot is always released; the refund is reported as whatever the
      // provider actually did.
      switch (result.refundOutcome) {
        case 'completed':
          return {
            tone: 'success',
            text: `ยกเลิกแล้ว ระบบคืนเงิน ${formatThb(result.refundThb)} ให้คุณเรียบร้อย`,
          };
        case 'pending':
          return {
            tone: 'info',
            text: `ยกเลิกแล้ว กำลังดำเนินการคืนเงิน ${formatThb(result.refundThb)} ตรวจสอบสถานะได้ที่หน้าการชำระเงิน`,
          };
        case 'failed':
          return {
            tone: 'warning',
            text: `ยกเลิกที่นั่งแล้ว แต่การคืนเงิน ${formatThb(result.refundThb)} ยังไม่สำเร็จ ระบบบันทึกรายการไว้แล้วและทีมงานจะดำเนินการต่อ`,
          };
        default:
          return {
            tone: 'success',
            text: 'ยกเลิกแล้ว ตามเงื่อนไขของก๊วนนี้ไม่มีการคืนเงิน',
          };
      }
    });

  const handleLeaveWaitlist = (entryId: string) =>
    run(async () => {
      const result = await leaveWaitlistAction(entryId);
      if (!result.ok)
        return {
          tone: 'danger',
          text: result.error ?? t.common.unexpectedError,
        };
      return { tone: 'info', text: 'ออกจากคิวสำรองแล้ว' };
    });

  return (
    <Card className="px-5 py-5">
      <p className="text-xs font-medium text-ink-500">{t.payment.amountDue}</p>
      <p className="text-2xl font-bold text-ink-900">{formatThb(props.amountThb)}</p>
      <p className="mt-0.5 text-xs text-ink-500">
        {t.session.deadline} · {formatCountdown(props.paymentDeadline)}
      </p>

      {feedback ? (
        <div className="mt-4">
          <Alert tone={feedback.tone}>{feedback.text}</Alert>
        </div>
      ) : null}

      <div className="mt-4">{renderAction()}</div>
    </Card>
  );

  function renderAction() {
    if (!props.isSignedIn) {
      return (
        <Link
          href={`/auth/sign-in?next=${encodeURIComponent(`/s/${props.publicCode}`)}`}
          className="block w-full rounded-xl bg-brand-600 px-5 py-3 text-center text-base font-semibold text-white hover:bg-brand-700 focus-ring"
        >
          เข้าสู่ระบบเพื่อเข้าร่วม
        </Link>
      );
    }

    if (props.status === 'cancelled') {
      return <DisabledAction label={t.session.join} reason="ก๊วนนี้ถูกยกเลิกแล้ว" />;
    }
    if (props.status === 'completed') {
      return <DisabledAction label={t.session.join} reason="ก๊วนนี้จบไปแล้ว" />;
    }
    if (props.status === 'draft') {
      return <DisabledAction label={t.session.join} reason="ผู้จัดยังไม่ได้เผยแพร่ก๊วนนี้" />;
    }
    if (started) {
      return <DisabledAction label={t.session.join} reason="ก๊วนนี้เริ่มไปแล้ว" />;
    }

    const participant = props.participant;

    if (participant?.status === 'paid_confirmed') {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ParticipantStatusChip status={participant.status} />
            <span className="text-sm text-ink-600">ที่นั่งของคุณยืนยันแล้ว</span>
          </div>
          {confirmingCancel ? (
            <div className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-3">
              <p className="text-sm text-red-900">
                ยืนยันการสละสิทธิ์? จำนวนเงินคืนจะคำนวณตามเงื่อนไขของก๊วนนี้
                และที่นั่งจะถูกส่งต่อให้คิวสำรอง
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleCancel(participant.id)}
                >
                  {pending ? t.common.loading : t.common.confirm}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingCancel(false)}>
                  {t.common.back}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              disabled={pending}
              onClick={() => setConfirmingCancel(true)}
            >
              สละสิทธิ์และขอคืนเงิน
            </Button>
          )}
        </div>
      );
    }

    // A pay-later debt. The button is the same payment flow; what changes is
    // that there is no deadline left to count down to, only a balance owed.
    if (participant?.status === 'joined_pay_later' || participant?.status === 'payment_overdue') {
      const overdue = participant.status === 'payment_overdue';
      return (
        <div className="space-y-2">
          <Button
            size="lg"
            className="w-full"
            disabled={pending}
            onClick={() => handlePay(participant.id)}
          >
            {pending
              ? t.payment.paying
              : `ชำระยอดค้าง ${formatThb(participant.amount_due_thb)}`}
          </Button>
          <p className="text-xs leading-relaxed text-ink-500">
            {overdue
              ? 'ก๊วนจบแล้วและยังค้างชำระ ระบบจะเตือนทุกวันและเครดิตของคุณจะลดลงจนกว่าจะชำระ'
              : 'ผู้จัดให้คุณจ่ายทีหลังได้ ระบบจะเตือนหลังก๊วนจบ'}{' '}
            · {t.mock.short}
          </p>
        </div>
      );
    }

    if (participant?.status === 'joined_pending_payment') {
      if (props.participantPaymentOverdue) {
        return <DisabledAction label={t.payment.payNow} reason={t.payment.expired} />;
      }
      return (
        <div className="space-y-2">
          <Button
            size="lg"
            className="w-full"
            disabled={pending}
            onClick={() => handlePay(participant.id)}
          >
            {pending
              ? t.payment.paying
              : `${t.payment.payNow} ${formatThb(participant.amount_due_thb)}`}
          </Button>
          <p className="text-xs text-ink-500">
            ต้องชำระภายใน {formatCountdown(participant.payment_due_at)} · {t.mock.short}
          </p>
        </div>
      );
    }

    if (participant?.status === 'payment_expired') {
      return (
        <div className="space-y-2">
          <Alert tone="warning">{t.payment.expired}</Alert>
          <Button className="w-full" disabled={pending || deadlinePassed} onClick={handleJoin}>
            {t.session.join}อีกครั้ง
          </Button>
        </div>
      );
    }

    const waitlistEntry = props.waitlistEntry;

    if (
      waitlistEntry &&
      (waitlistEntry.status === 'waiting' || waitlistEntry.status === 'promoted')
    ) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <WaitlistStatusChip status={waitlistEntry.status} />
            <Chip tone="neutral">
              {t.waitlistPage.position} {waitlistEntry.position}
            </Chip>
          </div>
          {waitlistEntry.status === 'promoted' && waitlistEntry.promotion_expires_at ? (
            <Alert tone="warning">
              คุณได้สิทธิ์แล้ว กรุณาชำระเงินภายใน{' '}
              {formatCountdown(waitlistEntry.promotion_expires_at)}
            </Alert>
          ) : (
            <p className="text-sm text-ink-600">{t.waitlistPage.explain}</p>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={pending}
            onClick={() => handleLeaveWaitlist(waitlistEntry.id)}
          >
            {t.waitlistPage.leave}
          </Button>
        </div>
      );
    }

    if (!JOINABLE.includes(props.status)) {
      return <DisabledAction label={t.session.join} reason="ก๊วนนี้ไม่เปิดรับผู้เล่นแล้ว" />;
    }
    if (deadlinePassed) {
      return <DisabledAction label={t.session.join} reason="เลยกำหนดชำระเงินแล้ว" />;
    }

    if (props.slotsLeft <= 0) {
      return (
        <div className="space-y-2">
          <Button
            size="lg"
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={handleJoin}
          >
            {pending ? t.common.loading : t.session.joinWaitlist}
          </Button>
          <p className="text-xs text-ink-500">
            {t.session.full} — เข้าคิวไว้ ระบบจะแจ้งเมื่อมีคนสละสิทธิ์
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Button size="lg" className="w-full" disabled={pending} onClick={handleJoin}>
          {pending ? t.common.loading : t.session.join}
        </Button>
        <p className="text-xs text-ink-500">
          เหลือ {props.slotsLeft} ที่ · จองที่นั่งแล้วชำระเงินในขั้นตอนถัดไป
        </p>
      </div>
    );
  }
}
