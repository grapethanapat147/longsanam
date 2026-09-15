'use client';

import { useState, useTransition } from 'react';
import { confirmCourtManuallyAction } from '@/lib/actions/session';
import { Button, Card } from '@/components/ui/primitives';
import { formatThb } from '@/lib/format';

/**
 * The organizer says they already have a court (LSN-0025).
 *
 * This is the path that lets a session reach `booked` with no partner venue
 * involved, which is what most badminton organizers actually need: they already
 * have a court they phone every week, what they lack is a way to collect money.
 *
 * The price field is the important one. settle_session_costs() reads the price
 * back off this booking, so it is the basis of everyone's share — the hint under
 * the field says so, because a number that quietly turns into other people's
 * bills should not look like a note to self.
 */
type Props = {
  sessionId: string;
  /** Cheapest approved court for the slot, shown only as a starting point. */
  estimatedCourtCostThb: number;
};

export function ManualCourtControl({ sessionId, estimatedCourtCostThb }: Props) {
  const [venueName, setVenueName] = useState('');
  const [price, setPrice] = useState(
    estimatedCourtCostThb > 0 ? String(estimatedCourtCostThb) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const priceThb = Number.isFinite(Number(price)) ? Math.round(Number(price)) : 0;
  const ready = venueName.trim().length > 0 && priceThb > 0;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await confirmCourtManuallyAction(sessionId, venueName, priceThb);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card className="px-5 py-4">
      <p className="font-medium text-ink-800">ได้คอร์ตมาเองแล้ว</p>
      <p className="mt-1 text-sm text-ink-500">
        ถ้าคุณจองคอร์ตกับสนามเองแล้ว บันทึกไว้ที่นี่เพื่อยืนยันก๊วนให้ผู้เล่น
      </p>

      <label className="mt-4 block text-sm font-medium text-ink-800">
        ชื่อสนาม
        <input
          type="text"
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          maxLength={120}
          placeholder="เช่น คอร์ตแบดลุงหมี"
          className="mt-1 w-full rounded-input border border-ink-300 px-3 py-2 text-base font-normal text-ink-900 placeholder:text-ink-400"
        />
      </label>

      <label className="mt-3 block text-sm font-medium text-ink-800">
        ค่าสนามที่จ่ายจริง (บาท)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mt-1 w-full rounded-input border border-ink-300 px-3 py-2 text-base font-normal tabular-nums text-ink-900"
        />
      </label>

      <p className="mt-2 text-xs leading-relaxed text-ink-500">
        ยอดนี้จะถูกใช้เป็นฐานหารค่าใช้จ่ายของทั้งก๊วนตอนสรุปยอด
        {estimatedCourtCostThb > 0
          ? ` · ค่าสนามโดยประมาณที่ระบบเคยแสดงคือ ${formatThb(estimatedCourtCostThb)}`
          : null}
      </p>

      {error ? <p className="mt-3 text-sm text-clay-700">{error}</p> : null}

      <Button
        type="button"
        onClick={submit}
        disabled={pending || !ready}
        className="mt-4 w-full"
      >
        {pending ? 'กำลังยืนยัน…' : 'ยืนยันว่าได้คอร์ตแล้ว'}
      </Button>
      {!ready ? (
        <p className="mt-2 text-xs text-ink-400">กรอกชื่อสนามและค่าสนามก่อนจึงยืนยันได้</p>
      ) : null}
    </Card>
  );
}
