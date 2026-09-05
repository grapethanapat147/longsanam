'use client';

import { useState, useTransition } from 'react';
import { grantPayLaterAction, revokePayLaterAction } from '@/lib/actions/participation';
import { CREDIT_START, PAY_LATER_MIN_SCORE, isPayLaterEligible } from '@/lib/domain/credit';
import { Button } from '@/components/ui/primitives';
import { formatThb } from '@/lib/format';
import type { ParticipantStatus } from '@/lib/domain/types';

/**
 * The organizer's pay-later control, one per participant row.
 *
 * The confirm step exists for one reason: granting removes this seat from the
 * count that unlocks a booking, and the organizer should read that in numbers
 * before agreeing to it, not discover it later when the session fails to book.
 */

type Props = {
  participantId: string;
  status: ParticipantStatus;
  amountDueThb: number;
  /** Null when the player has never been scored, which is not a score of zero. */
  score: number | null;
  paidParticipants: number;
  minPlayers: number;
  sessionClosed: boolean;
};

export function PayLaterControl({
  participantId,
  status,
  amountDueThb,
  score,
  paidParticipants,
  minPlayers,
  sessionClosed,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effectiveScore = score ?? CREDIT_START;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) setConfirming(false);
      else setError(result.error ?? null);
    });
  }

  if (status === 'joined_pay_later' || status === 'payment_overdue') {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => run(() => revokePayLaterAction(participantId))}
        >
          ยกเลิกสิทธิ์
        </Button>
        {error ? <p className="text-xs text-clay-700">{error}</p> : null}
      </div>
    );
  }

  if (status !== 'joined_pending_payment') return null;

  if (sessionClosed) {
    return (
      <Button variant="secondary" size="sm" disabled>
        ก๊วนปิดแล้ว
      </Button>
    );
  }

  // Disabled with the reason showing, never hidden: a control that vanishes
  // teaches the organizer nothing about why.
  if (!isPayLaterEligible(effectiveScore)) {
    return (
      <div className="flex flex-col items-end gap-1 text-right">
        <Button variant="secondary" size="sm" disabled>
          ให้จ่ายทีหลัง
        </Button>
        <p className="text-xs text-ink-500">
          เครดิต {effectiveScore} ต่ำกว่าเกณฑ์ {PAY_LATER_MIN_SCORE}
        </p>
      </div>
    );
  }

  if (!confirming) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        ให้จ่ายทีหลัง
      </Button>
    );
  }

  // The seat is currently unpaid, so it is not in paidParticipants either way.
  // What granting changes is that it stops being a seat that *could* still pay
  // before the session — hence the shortfall is stated against min_players.
  const shortBy = Math.max(0, minPlayers - paidParticipants);

  return (
    <div className="flex max-w-xs flex-col items-end gap-2 text-right">
      <p className="text-xs leading-relaxed text-ink-600">
        คนนี้จะไม่ถูกนับในยอดผู้จ่ายแล้ว ตอนนี้ {paidParticipants} จาก {minPlayers} คน
        {shortBy > 0
          ? ` ยังขาดอีก ${shortBy} คนถึงจะจองสนามได้ ต้องหาคนจ่ายเพิ่ม`
          : ' ยังถึงเกณฑ์จองสนามอยู่'}
        {` และ ${formatThb(amountDueThb)} จะยังไม่เข้าก่อนวันเล่น`}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          ยกเลิก
        </Button>
        <Button size="sm" disabled={pending} onClick={() => run(() => grantPayLaterAction(participantId))}>
          ยืนยัน
        </Button>
      </div>
      {error ? <p className="text-xs text-clay-700">{error}</p> : null}
    </div>
  );
}
