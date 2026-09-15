'use client';

import { useState, useTransition } from 'react';
import {
  createSessionChargeAction,
  sendSessionChargesAction,
  voidSessionChargeAction,
} from '@/lib/actions/session';
import { Button, Card, Chip } from '@/components/ui/primitives';
import { chargeNeedsConfirm, chargeOverageThb, chargeShareThb } from '@/lib/domain/charge-split';
import { formatThb } from '@/lib/format';
import { t } from '@/i18n';

/**
 * รายการเก็บเงินเพิ่มหลังจบก๊วน (LSN-0024)
 *
 * สองขั้นตอนโดยตั้งใจ: สร้างแล้วยังไม่มีหนี้ กดส่งถึงมี ผู้จัดจึงสร้างได้หลายบรรทัด
 * ดูว่าใครโดนเท่าไร แล้วลบอันที่พิมพ์ผิดทิ้งได้เงียบ ๆ ก่อนมีใครรู้
 *
 * พรีวิวยอดต่อคนใช้ฟังก์ชันเดียวกับที่ฝั่ง SQL คำนวณ ถ้าสองฝั่งไม่ตรงกัน
 * กล่องยืนยันจะโกหก ซึ่งแย่กว่าไม่มีกล่องยืนยันเลย
 */
export type ChargeRow = {
  id: string;
  label: string;
  amountThb: number;
  splitMode: 'all' | 'named';
  sent: boolean;
  shares: { participantId: string; displayName: string; amountThb: number; isGuest: boolean }[];
};

type Props = {
  sessionId: string;
  sportSlug: string;
  /** คนที่นับในตัวหาร — คนที่มาเล่นจริง */
  players: { participantId: string; displayName: string; isGuest: boolean }[];
  charges: ChargeRow[];
};

export function ChargeControl({ sessionId, sportSlug, players, charges }: Props) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'all' | 'named'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountThb = Number.isFinite(Number(amount)) ? Math.round(Number(amount)) : 0;
  const people = mode === 'all' ? players.length : picked.length;
  const perHead = chargeShareThb(amountThb, people);
  const overage = chargeOverageThb(amountThb, people);
  const ready = label.trim().length > 0 && amountThb > 0 && people > 0;
  const drafts = charges.filter((c) => !c.sent).length;
  const chips = t.chargeChips[sportSlug] ?? t.chargeChips.custom;

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function create() {
    setError(null);
    // กล่องยืนยันแสดง **ยอดต่อคน** ไม่ใช่ยอดรวม เพราะนั่นคือเลขที่คนมองแล้วรู้ทันที
    // ว่าพิมพ์ผิด — "฿5,000" ยังพอเป็นไปได้ แต่ "คนละ ฿625" สะดุดตาทันที
    if (chargeNeedsConfirm(amountThb)) {
      const ok = window.confirm(
        `${formatThb(amountThb)} หาร ${people} คน = คนละ ${formatThb(perHead)}\n\nยืนยันไหม`,
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await createSessionChargeAction(sessionId, label, amountThb, mode, picked);
      if (!result.ok) return setError(result.error);
      setLabel('');
      setAmount('');
      setPicked([]);
    });
  }

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendSessionChargesAction(sessionId);
      if (!result.ok) setError(result.error);
    });
  }

  function remove(chargeId: string) {
    setError(null);
    startTransition(async () => {
      const result = await voidSessionChargeAction(chargeId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card className="px-5 py-4">
      <p className="font-medium text-ink-800">{t.charges.title}</p>
      <p className="mt-1 text-sm text-ink-500">{t.charges.hint}</p>

      <label className="mt-4 block text-sm font-medium text-ink-800">
        {t.charges.labelField}
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          className="mt-1 w-full rounded-input border border-ink-300 px-3 py-2 text-base font-normal text-ink-900"
        />
      </label>

      <div className="mt-2 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setLabel(c)}
            className="rounded-full border border-ink-300 px-3 py-1 text-xs text-ink-700"
          >
            {c}
          </button>
        ))}
      </div>

      <label className="mt-3 block text-sm font-medium text-ink-800">
        {t.charges.amountField}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={100000}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-input border border-ink-300 px-3 py-2 text-base font-normal tabular-nums text-ink-900"
        />
      </label>

      <div className="mt-3 flex gap-2">
        {(['all', 'named'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`flex-1 rounded-input border px-3 py-2 text-sm ${
              mode === m ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-300 text-ink-700'
            }`}
          >
            {m === 'all' ? t.charges.splitAll : t.charges.splitNamed}
          </button>
        ))}
      </div>

      {mode === 'named' ? (
        <ul className="mt-3 divide-y divide-ink-200">
          {players.map((p) => (
            <li key={p.participantId} className="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                id={`pick-${p.participantId}`}
                checked={picked.includes(p.participantId)}
                onChange={() => toggle(p.participantId)}
                className="h-5 w-5 accent-brand-600"
              />
              <label htmlFor={`pick-${p.participantId}`} className="flex-1 text-sm text-ink-900">
                {p.displayName}
              </label>
              {p.isGuest ? <Chip tone="guest">{t.receipt.guestChip}</Chip> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {amountThb > 0 && people > 0 ? (
        <p className="mt-3 text-sm text-ink-700">
          คนละ <span className="font-semibold tabular-nums">{formatThb(perHead)}</span> · {people} คน
          {overage > 0 ? (
            <span className="text-ink-500"> · เก็บเกิน {formatThb(overage)} ผู้จัดรับไป</span>
          ) : null}
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-clay-700">{error}</p> : null}

      <Button type="button" onClick={create} disabled={pending || !ready} className="mt-3 w-full">
        {t.charges.create}
      </Button>

      {charges.length > 0 ? (
        <ul className="mt-4 divide-y divide-ink-200 border-t border-ink-200 pt-2">
          {charges.map((c) => (
            <li key={c.id} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
                  {c.label}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-ink-700">
                  {formatThb(c.amountThb)}
                </span>
                <Chip tone={c.sent ? 'success' : 'warning'}>
                  {c.sent ? t.charges.sent : t.charges.draft}
                </Chip>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={pending}
                  className="shrink-0 text-xs text-clay-700 underline"
                >
                  {t.charges.remove}
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                {c.shares
                  .map((sh) => `${sh.displayName} ${formatThb(sh.amountThb)}`)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-ink-200 pt-3 text-sm text-ink-500">{t.charges.empty}</p>
      )}

      <Button
        type="button"
        onClick={send}
        disabled={pending || drafts === 0}
        className="mt-3 w-full"
      >
        {t.charges.send}
      </Button>
      <p className="mt-2 text-xs text-ink-500">
        {drafts === 0 ? t.charges.nothingToSend : t.charges.sendHint}
      </p>
    </Card>
  );
}
