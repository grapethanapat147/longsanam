'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  confirmMatchAction,
  disputeMatchAction,
  recordMatchAction,
  voidMatchAction,
} from '@/lib/actions/match';
import { Button, Card, Chip, Field, Input } from '@/components/ui/primitives';
import { t } from '@/i18n';

export type MatchRow = {
  id: string;
  courtLabel: string | null;
  scoreA: number;
  scoreB: number;
  status: 'recorded' | 'confirmed' | 'disputed' | 'voided';
  sideAName: string;
  sideBName: string;
  /** ผู้ใช้ยืนยันแมตช์นี้ได้ไหม — ตัดสินฝั่งเซิร์ฟเวอร์ ไม่ใช่ที่นี่ */
  canConfirm: boolean;
  canVoid: boolean;
};

const chipTone = {
  recorded: 'warning',
  confirmed: 'success',
  disputed: 'warning',
  voided: 'neutral',
} as const;

const chipLabel = {
  recorded: t.matches.statusRecorded,
  confirmed: t.matches.statusConfirmed,
  disputed: t.matches.statusDisputed,
  voided: t.matches.statusVoided,
} as const;

/**
 * รายการผลแมตช์
 *
 * ปุ่ม "ยืนยันผล" **ไม่ขึ้นเลย** สำหรับคนฝั่งเดียวกับผู้บันทึก ไม่ใช่ขึ้นแล้ว
 * กดไม่ได้ เพราะกติกานี้ไม่ใช่เงื่อนไขชั่วคราว มันจริงเสมอสำหรับคนฝั่งนั้น
 * และหน้าจอบอกเหตุผลแทน เพื่อไม่ให้คนงงว่าทำไมตัวเองยืนยันไม่ได้
 */
export function MatchList({ matches }: { matches: MatchRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await fn();
      setBusyId(null);
      if (!result.ok) return setError(result.error ?? null);
      router.refresh();
    });
  }

  if (matches.length === 0) {
    return (
      <Card className="px-5 py-4">
        <p className="font-medium text-ink-800">{t.matches.title}</p>
        <p className="mt-2 text-sm text-ink-500">{t.matches.empty}</p>
      </Card>
    );
  }

  return (
    <Card className="px-5 py-4">
      <p className="font-medium text-ink-800">{t.matches.title}</p>
      <p className="mt-1 text-sm text-ink-500">{t.matches.onlyConfirmedCounts}</p>

      {error ? <p className="mt-2 text-sm text-clay-700">{error}</p> : null}

      <ul className="mt-3 divide-y divide-ink-200">
        {matches.map((m) => (
          <li key={m.id} className="py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                {m.sideAName} <span className="tabular-nums font-semibold">{m.scoreA}</span>
                {' – '}
                <span className="tabular-nums font-semibold">{m.scoreB}</span> {m.sideBName}
              </span>
              <Chip tone={chipTone[m.status]}>{chipLabel[m.status]}</Chip>
            </div>
            {m.courtLabel ? <p className="text-xs text-ink-500">{m.courtLabel}</p> : null}

            {m.status === 'recorded' ? (
              m.canConfirm ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    onClick={() => run(m.id, () => confirmMatchAction(m.id))}
                    disabled={pending && busyId === m.id}
                    className="flex-1"
                  >
                    {t.matches.confirm}
                  </Button>
                  <button
                    type="button"
                    onClick={() =>
                      run(m.id, () => disputeMatchAction(m.id, t.matches.disputeNote))
                    }
                    disabled={pending && busyId === m.id}
                    className="flex-1 rounded-input border border-ink-300 px-3 py-2 text-sm text-ink-700 focus-ring"
                  >
                    {t.matches.dispute}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-ink-500">{t.matches.waitingForOtherSide}</p>
              )
            ) : null}

            {m.canVoid && m.status !== 'voided' ? (
              <button
                type="button"
                onClick={() => run(m.id, () => voidMatchAction(m.id, t.matches.voidReason))}
                disabled={pending && busyId === m.id}
                className="mt-2 text-xs text-clay-700 underline"
              >
                {t.matches.void}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {matches.some((m) => m.canVoid) ? (
        <p className="mt-3 text-xs text-ink-500">{t.matches.voidHint}</p>
      ) : null}
    </Card>
  );
}

export function RecordMatchForm({
  tournamentId,
  sideAGroupId,
  sideBGroupId,
  sideAPlayers,
  sideBPlayers,
}: {
  tournamentId: string;
  sideAGroupId: string;
  sideBGroupId: string;
  sideAPlayers: { id: string; name: string }[];
  sideBPlayers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [a, setA] = useState(sideAPlayers[0]?.id ?? '');
  const [b, setB] = useState(sideBPlayers[0]?.id ?? '');
  const [scoreA, setScoreA] = useState('21');
  const [scoreB, setScoreB] = useState('15');
  const [court, setCourt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await recordMatchAction({
        tournamentId,
        sideAGroupId,
        sideBGroupId,
        sideAPlayers: [a],
        sideBPlayers: [b],
        scoreA: Number(scoreA),
        scoreB: Number(scoreB),
        courtLabel: court,
      });
      if (!result.ok) return setError(result.error);
      setCourt('');
      router.refresh();
    });
  }

  return (
    <Card className="mt-4 px-5 py-4">
      <p className="font-medium text-ink-800">{t.matches.recordTitle}</p>

      <Field label={t.matches.scoreField} htmlFor="score-a">
        <div className="flex items-center gap-2">
          <select
            value={a}
            onChange={(e) => setA(e.target.value)}
            className="min-w-0 flex-1 rounded-input border border-ink-400 px-2 py-2 text-sm"
          >
            {sideAPlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Input
            id="score-a"
            type="number"
            min={0}
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
            className="w-16 text-center tabular-nums"
          />
          <span className="text-ink-500">–</span>
          <Input
            type="number"
            min={0}
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            className="w-16 text-center tabular-nums"
          />
          <select
            value={b}
            onChange={(e) => setB(e.target.value)}
            className="min-w-0 flex-1 rounded-input border border-ink-400 px-2 py-2 text-sm"
          >
            {sideBPlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </Field>

      <Field label={t.matches.courtField} htmlFor="court-label">
        <Input id="court-label" value={court} onChange={(e) => setCourt(e.target.value)} />
      </Field>

      {error ? <p className="mt-2 text-sm text-clay-700">{error}</p> : null}

      <Button
        type="button"
        onClick={submit}
        disabled={pending || !a || !b}
        className="mt-3 w-full"
      >
        {t.matches.record}
      </Button>
    </Card>
  );
}
