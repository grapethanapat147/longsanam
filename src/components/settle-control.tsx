'use client';

import { useState, useTransition } from 'react';
import { settleSessionAction } from '@/lib/actions/session';
import { settleSession, type SplitMode } from '@/lib/domain/settlement';
import { Button, Card } from '@/components/ui/primitives';
import { formatThb } from '@/lib/format';

/**
 * Settling is a session-level act, so this lives with the other session actions
 * rather than in the participant list.
 *
 * The preview runs the same pure function the server does, so the organizer
 * reads the figure before agreeing to it rather than discovering it afterwards.
 */
type Props = {
  sessionId: string;
  courtCostThb: number;
  shuttleCostThb: number;
  splitMode: SplitMode;
  settledPerPersonThb: number | null;
  players: { participantId: string; gamesPlayed: number | null }[];
  closed: boolean;
};

export function SettleControl({
  sessionId,
  courtCostThb,
  shuttleCostThb,
  splitMode,
  settledPerPersonThb,
  players,
  closed,
}: Props) {
  const [shuttle, setShuttle] = useState(String(shuttleCostThb));
  const [mode, setMode] = useState<SplitMode>(splitMode);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shuttleThb = Number.isFinite(Number(shuttle)) ? Math.max(0, Number(shuttle)) : 0;
  const preview = settleSession({
    courtCostThb,
    shuttleCostThb: shuttleThb,
    splitMode: mode,
    players,
  });

  if (closed) {
    return (
      <Card className="px-5 py-4">
        <p className="font-medium text-ink-800">สรุปยอด</p>
        <p className="mt-1 text-sm text-ink-500">ก๊วนนี้ปิดแล้ว สรุปยอดไม่ได้</p>
      </Card>
    );
  }

  return (
    <Card className="px-5 py-4">
      <p className="font-medium text-ink-800">สรุปยอด</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-600">
        คิดจากค่าสนามจริงบวกค่าลูก แล้วหารตามคนที่มา ยอดนี้ใช้ทวงคนที่ยังไม่จ่าย
        คนที่จ่ายไปแล้วไม่ถูกแตะ
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs text-ink-500">ค่าลูกแบดรวม (บาท)</span>
          <input
            type="number"
            min={0}
            value={shuttle}
            onChange={(e) => setShuttle(e.target.value)}
            className="focus-ring mt-1 w-32 rounded-lg border hairline px-2 py-1"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-ink-500">วิธีแบ่ง</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as SplitMode)}
            className="focus-ring mt-1 rounded-lg border hairline px-2 py-1"
          >
            <option value="equal">หารเท่ากัน</option>
            <option value="by_games">ตามจำนวนเกม</option>
          </select>
        </label>
      </div>

      <p className="mt-3 text-sm text-ink-700">
        ค่าสนาม {formatThb(courtCostThb)} + ค่าลูก {formatThb(shuttleThb)} ={' '}
        {formatThb(preview.totalThb)} · {players.length} คน ·{' '}
        <strong>{formatThb(preview.perPersonThb)} ต่อคน</strong>
        {preview.organizerAbsorbsThb > 0
          ? ` (เศษ ${formatThb(preview.organizerAbsorbsThb)} ผู้จัดรับไว้)`
          : ''}
      </p>

      {settledPerPersonThb !== null ? (
        <p className="mt-1 text-xs text-ink-500">
          สรุปไว้ล่าสุด {formatThb(settledPerPersonThb)} ต่อคน · สรุปใหม่ได้จนกว่าจะจ่ายครบ
        </p>
      ) : null}

      <div className="mt-3">
        <Button
          size="sm"
          disabled={pending || players.length === 0}
          onClick={() => {
            setError(null);
            setMessage(null);
            startTransition(async () => {
              const result = await settleSessionAction(sessionId, shuttleThb, mode);
              if (result.ok) {
                setMessage(
                  `สรุปแล้ว ${formatThb(result.perPersonThb)} ต่อคน · อัปเดตยอดค้าง ${result.unpaidUpdated} คน`,
                );
              } else {
                setError(result.error);
              }
            });
          }}
        >
          {pending ? 'กำลังสรุป…' : 'สรุปยอด'}
        </Button>
        {players.length === 0 ? (
          <p className="mt-2 text-xs text-ink-500">ยังไม่มีผู้เล่นที่นับได้ในก๊วนนี้</p>
        ) : null}
      </div>

      {message ? <p className="mt-2 text-xs text-brand-700">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-clay-700">{error}</p> : null}
    </Card>
  );
}
