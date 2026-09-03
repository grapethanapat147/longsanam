'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  cancelSessionAction,
  publishSessionAction,
  setPreferenceApprovalAction,
  triggerBookingAction,
} from '@/lib/actions/session';
import { Alert, Button, Card, Chip, DisabledAction, Input } from '@/components/ui/primitives';
import { formatThb } from '@/lib/format';
import { describePolicy } from '@/lib/domain/refund';
import { reasonLabel, t } from '@/i18n';
import type { CancellationPolicy, SessionStatus } from '@/lib/domain/types';
import type { BookingEligibility } from '@/lib/domain/booking-eligibility';

type Preference = {
  id: string;
  priority: number;
  approved: boolean;
  venueName: string;
  courtName: string;
  district: string;
  priceThb: number;
};

type Props = {
  sessionId: string;
  status: SessionStatus;
  eligibility: BookingEligibility;
  preferences: Preference[];
  policy: CancellationPolicy;
  startsAt: string;
  paidParticipants: number;
  paidTotalThb: number;
};

type Feedback = {
  tone: 'success' | 'danger' | 'info' | 'warning';
  text: string;
} | null;

export function OrganizerControls(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  function run(fn: () => Promise<Feedback>) {
    setFeedback(null);
    startTransition(async () => {
      setFeedback(await fn());
      router.refresh();
    });
  }

  const publish = () =>
    run(async () => {
      const result = await publishSessionAction(props.sessionId);
      return result.ok
        ? { tone: 'success', text: t.organizer.published }
        : { tone: 'danger', text: result.error ?? t.common.unexpectedError };
    });

  const book = () =>
    run(async () => {
      const result = await triggerBookingAction(props.sessionId);
      return { tone: result.ok ? 'success' : 'warning', text: result.message };
    });

  const toggleApproval = (preferenceId: string, approved: boolean) =>
    run(async () => {
      const result = await setPreferenceApprovalAction(preferenceId, approved);
      return result.ok
        ? {
            tone: 'info',
            text: approved
              ? 'อนุมัติสนามนี้ให้ระบบจองได้แล้ว'
              : 'ยกเลิกการอนุมัติแล้ว ระบบจะไม่จองสนามนี้',
          }
        : { tone: 'danger', text: result.error ?? t.common.unexpectedError };
    });

  const cancel = () =>
    run(async () => {
      const result = await cancelSessionAction(props.sessionId, cancelReason.trim());
      setShowCancel(false);
      if (!result.ok) return { tone: 'danger', text: result.error };
      return {
        tone: 'success',
        text:
          result.refundedPlayers > 0
            ? `ยกเลิกก๊วนแล้ว คืนเงินผู้เล่น ${result.refundedPlayers} คน รวม ${formatThb(result.refundedThb)}`
            : 'ยกเลิกก๊วนแล้ว ไม่มีผู้เล่นที่ต้องคืนเงิน',
      };
    });

  const terminal = props.status === 'cancelled' || props.status === 'completed';
  const approvedCount = props.preferences.filter((p) => p.approved).length;

  return (
    <Card className="space-y-4 px-5 py-5">
      <h2 className="font-semibold text-ink-900">การจัดการก๊วน</h2>

      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}

      {/* Publish */}
      {props.status === 'draft' ? (
        <div className="space-y-2">
          <Button size="lg" disabled={pending || approvedCount === 0} onClick={publish}>
            {pending ? t.common.loading : t.organizer.publish}
          </Button>
          <p className="text-xs text-ink-500">
            {approvedCount === 0
              ? 'ต้องอนุมัติสนามอย่างน้อย 1 แห่งก่อนเผยแพร่'
              : 'เผยแพร่แล้วผู้เล่นจะเข้าร่วมและชำระเงินได้ทันที'}
          </p>
        </div>
      ) : null}

      {/* Book now */}
      {!terminal && props.status !== 'draft' ? (
        <div className="border-t border-ink-200 pt-4">
          <h3 className="text-sm font-semibold text-ink-800">{t.organizer.bookNow}</h3>
          <p className="mt-1 text-xs text-ink-500">
            ปกติระบบจะจองให้อัตโนมัติเมื่อครบเงื่อนไข ปุ่มนี้ใช้สั่งจองซ้ำหรือลองสนามสำรองถัดไป
          </p>
          <div className="mt-2">
            {props.eligibility.eligible ? (
              <Button disabled={pending} onClick={book}>
                {pending ? t.common.loading : t.organizer.bookNow}
              </Button>
            ) : props.status === 'booked' ? (
              <Chip tone="success">ได้สนามแล้ว</Chip>
            ) : props.status === 'holding_court' ? (
              <div className="space-y-2">
                <Chip tone="warning">กำลังรอสนามยืนยัน</Chip>
                <div>
                  <Button variant="secondary" size="sm" disabled={pending} onClick={book}>
                    ตรวจสอบสถานะอีกครั้ง
                  </Button>
                </div>
              </div>
            ) : (
              <DisabledAction
                label={t.organizer.bookNow}
                reason={blockedReason(props.eligibility)}
              />
            )}
          </div>
        </div>
      ) : null}

      {/* Fallback ordering */}
      <div className="border-t border-ink-200 pt-4">
        <h3 className="text-sm font-semibold text-ink-800">{t.session.venuePreferences}</h3>
        <p className="mt-1 text-xs text-ink-500">{t.session.fallbackNote}</p>
        <ul className="mt-3 space-y-2">
          {props.preferences.map((preference) => (
            <li
              key={preference.id}
              className="flex items-center gap-3 rounded-xl border border-ink-200 px-3 py-2"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-bold text-ink-700">
                {preference.priority}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">
                  {preference.venueName} · {preference.courtName}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {preference.district} · {formatThb(preference.priceThb)} สำหรับช่วงเวลานี้
                </p>
              </div>
              {terminal ? (
                <Chip tone={preference.approved ? 'success' : 'neutral'}>
                  {preference.approved ? 'อนุมัติ' : 'ไม่อนุมัติ'}
                </Chip>
              ) : (
                <Button
                  size="sm"
                  variant={preference.approved ? 'secondary' : 'primary'}
                  disabled={pending}
                  onClick={() => toggleApproval(preference.id, !preference.approved)}
                >
                  {preference.approved ? 'ยกเลิกอนุมัติ' : 'อนุมัติ'}
                </Button>
              )}
            </li>
          ))}
          {props.preferences.length === 0 ? (
            <li className="text-sm text-ink-500">{t.common.empty}</li>
          ) : null}
        </ul>
      </div>

      {/* Cancellation */}
      {!terminal ? (
        <div className="border-t border-ink-200 pt-4">
          <h3 className="text-sm font-semibold text-ink-800">{t.organizer.cancelSession}</h3>
          <ul className="mt-1 space-y-0.5 text-xs text-ink-500">
            {describePolicy(props.policy).map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>

          {showCancel ? (
            <div className="mt-3 space-y-2 rounded-xl border border-red-300 bg-red-50 p-3">
              <p className="text-sm text-red-900">
                ผู้เล่นที่ชำระเงินแล้ว {props.paidParticipants} คน (รวม{' '}
                {formatThb(props.paidTotalThb)}) จะได้รับเงินคืนตามเงื่อนไขข้างต้น
                และคอร์ตที่จองไว้จะถูกยกเลิก
              </p>
              <Input
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="เหตุผลในการยกเลิก (แจ้งให้ผู้เล่นทราบ)"
                maxLength={200}
              />
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending || cancelReason.trim().length < 3}
                  onClick={cancel}
                >
                  {pending ? t.common.loading : 'ยืนยันยกเลิกก๊วน'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowCancel(false)}>
                  {t.common.back}
                </Button>
              </div>
              {cancelReason.trim().length < 3 ? (
                <p className="text-xs text-red-700">กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร</p>
              ) : null}
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => setShowCancel(true)}
            >
              {t.organizer.cancelSession}
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function blockedReason(eligibility: BookingEligibility): string {
  if (eligibility.eligible) return '';
  const base = reasonLabel[eligibility.reason] ?? 'ยังจองไม่ได้';
  const parts: string[] = [base];
  if (eligibility.missingPlayers > 0) parts.push(`ขาดอีก ${eligibility.missingPlayers} คน`);
  if (eligibility.shortfallThb > 0) parts.push(`ขาดอีก ${formatThb(eligibility.shortfallThb)}`);
  return parts.join(' · ');
}
