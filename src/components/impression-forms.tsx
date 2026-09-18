'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ratePlayerAction, rateTournamentAction } from '@/lib/actions/tournament';
import { Button, Card, Select } from '@/components/ui/primitives';
import { t } from '@/i18n';

/**
 * คะแนนความประทับใจ (LSN-0039)
 *
 * แกนนี้ไม่กำหนดรุ่นและไม่แตะเงิน จึงไม่ต้องมีการยืนยันสองฝั่งแบบผลแมตช์
 * ด่านทั้งหมดอยู่ที่ฐานข้อมูล หน้าจอแค่ไม่แสดงปุ่มให้คนที่กดไม่ได้อยู่แล้ว
 */

const SCALE = [5, 4, 3, 2, 1];

function ScoreSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-700">{label}</span>
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 shrink-0"
      >
        {SCALE.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function RatePlayersForm({
  tournamentId,
  players,
  existing,
}: {
  tournamentId: string;
  players: { id: string; name: string }[];
  existing: Record<string, { punctuality: number; manners: number; fun: number }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [p, setP] = useState(5);
  const [m, setM] = useState(5);
  const [f, setF] = useState(5);

  if (players.length === 0) return null;

  function start(id: string) {
    const prior = existing[id];
    setP(prior?.punctuality ?? 5);
    setM(prior?.manners ?? 5);
    setF(prior?.fun ?? 5);
    setError(null);
    setDone(null);
    setOpen(id);
  }

  function submit(rateeId: string) {
    setError(null);
    startTransition(async () => {
      const result = await ratePlayerAction({
        tournamentId,
        rateeId,
        punctuality: p,
        manners: m,
        fun: f,
      });
      if (!result.ok) return setError(result.error);
      setDone(rateeId);
      setOpen(null);
      router.refresh();
    });
  }

  return (
    <Card className="px-5 py-4">
      <p className="font-medium text-ink-800">{t.impressions.rateTitle}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{t.impressions.rateHint}</p>

      {error ? <p className="mt-2 text-sm text-clay-700">{error}</p> : null}

      <ul className="mt-3 divide-y divide-ink-200">
        {players.map((player) => (
          <li key={player.id} className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-ink-900">{player.name}</span>
              {done === player.id ? (
                <span className="shrink-0 text-xs font-semibold text-brand-700">
                  {t.impressions.saved}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => (open === player.id ? setOpen(null) : start(player.id))}
                  className="focus-ring shrink-0 rounded text-xs font-semibold text-brand-700 hover:underline"
                >
                  {existing[player.id] ? 'แก้คะแนน' : 'ให้คะแนน'}
                </button>
              )}
            </div>

            {open === player.id ? (
              <div className="mt-2.5 grid gap-2 rounded-xl bg-ink-50 px-3 py-3">
                <ScoreSelect
                  id={`p-${player.id}`}
                  label={t.impressions.punctuality}
                  value={p}
                  onChange={setP}
                />
                <ScoreSelect
                  id={`m-${player.id}`}
                  label={t.impressions.manners}
                  value={m}
                  onChange={setM}
                />
                <ScoreSelect
                  id={`f-${player.id}`}
                  label={t.impressions.fun}
                  value={f}
                  onChange={setF}
                />
                <Button
                  type="button"
                  onClick={() => submit(player.id)}
                  disabled={pending}
                  className="mt-1 w-full"
                >
                  {t.impressions.save}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function RateEventForm({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [court, setCourt] = useState(5);
  const [org, setOrg] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await rateTournamentAction({
        tournamentId,
        courtCondition: court,
        organisation: org,
      });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card className="px-5 py-4">
      <p className="font-medium text-ink-800">{t.impressions.rateEventTitle}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{t.impressions.rateEventHint}</p>

      <div className="mt-3 grid gap-2">
        <ScoreSelect
          id="ev-court"
          label={t.impressions.courtCondition}
          value={court}
          onChange={setCourt}
        />
        <ScoreSelect
          id="ev-org"
          label={t.impressions.organisation}
          value={org}
          onChange={setOrg}
        />
      </div>

      {error ? <p className="mt-2 text-sm text-clay-700">{error}</p> : null}

      <Button type="button" onClick={submit} disabled={pending} className="mt-3 w-full">
        {saved ? t.impressions.saved : t.impressions.save}
      </Button>
    </Card>
  );
}

/** การ์ดแสดงค่าเฉลี่ย ใช้ได้ทั้งของคนและของก๊วน */
export function ImpressionSummaryCard({
  title,
  summary,
}: {
  title: string;
  summary: {
    raters: number;
    ready: boolean;
    punctuality?: number;
    manners?: number;
    fun?: number;
    overall?: number;
  } | null;
}) {
  const rows: [string, number | undefined][] = [
    [t.impressions.punctuality, summary?.punctuality],
    [t.impressions.manners, summary?.manners],
    [t.impressions.fun, summary?.fun],
  ];

  return (
    <Card className="px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-ink-900">{title}</h2>
        {summary?.ready ? (
          <span className="font-display text-2xl font-semibold tabular-nums text-ink-900">
            {summary.overall}
          </span>
        ) : null}
      </div>

      {!summary || summary.raters === 0 ? (
        <p className="mt-2 text-sm text-ink-600">{t.impressions.none}</p>
      ) : !summary.ready ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          {t.impressions.notReady(summary.raters)}
        </p>
      ) : (
        <>
          <dl className="mt-3 grid gap-1.5 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">{label}</dt>
                <dd className="font-medium tabular-nums text-ink-800">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-ink-500">{t.impressions.raters(summary.raters)}</p>
        </>
      )}

      <p className="mt-3 border-t hairline pt-3 text-xs leading-relaxed text-ink-500">
        {t.impressions.note}
      </p>
    </Card>
  );
}
