'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  confirmTournamentCourtAction,
  createTournamentAction,
  joinTournamentAction,
  payTournamentTeamAction,
  publishTournamentAction,
} from '@/lib/actions/tournament';
import { Button, Card, Field, Input, Select } from '@/components/ui/primitives';
import { dateMinusDays, formatDate } from '@/lib/format';
import { ThaiDateField } from '@/components/thai-date-field';
import { TIERS, tierExample } from '@/lib/domain/tiers';
import { t } from '@/i18n';

/**
 * ปุ่มของทัวร์นาเมนต์
 *
 * ไม่มีปุ่มไหนถูกซ่อนด้วยเหตุผลเรื่อง "ลำดับ" — เจ้าภาพยืนยันคอร์ตได้ตลอดเวลา
 * แม้ยังไม่มีทีมครบ และทีมจ่ายได้แม้คอร์ตยังไม่ยืนยัน เพราะสามประตูเป็นอิสระ
 * ต่อกันตามที่ตั๋วตัดสินไว้ ปุ่มที่หายไปตามลำดับจะสอนผู้ใช้ผิด
 */
export function TournamentControls({
  tournamentId,
  isHost,
  status,
  courtConfirmed,
  myGroupId,
  myTeamPaid,
}: {
  tournamentId: string;
  isHost: boolean;
  status: string;
  courtConfirmed: boolean;
  myGroupId: string | null;
  myTeamPaid: boolean;
}) {
  const router = useRouter();
  const [venueNote, setVenueNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error ?? null);
      router.refresh();
    });
  }

  if (status === 'cancelled' || status === 'completed') return null;

  return (
    <Card className="px-5 py-4">
      {error ? <p className="mb-2 text-sm text-clay-700">{error}</p> : null}

      {isHost && status === 'draft' ? (
        <Button
          type="button"
          onClick={() => run(() => publishTournamentAction(tournamentId))}
          disabled={pending}
          className="w-full"
        >
          {t.tournaments.publish}
        </Button>
      ) : null}

      {isHost && !courtConfirmed ? (
        <>
          <Field label={t.tournaments.venueNoteField} htmlFor="venue-note">
            <Input
              id="venue-note"
              value={venueNote}
              onChange={(e) => setVenueNote(e.target.value)}
            />
          </Field>
          <Button
            type="button"
            onClick={() => run(() => confirmTournamentCourtAction(tournamentId, venueNote))}
            disabled={pending}
            className="mt-2 w-full"
          >
            {t.tournaments.confirmCourt}
          </Button>
        </>
      ) : null}

      {myGroupId && !myTeamPaid ? (
        <Button
          type="button"
          onClick={() => run(() => payTournamentTeamAction(tournamentId, myGroupId))}
          disabled={pending}
          className="mt-2 w-full"
        >
          {t.tournaments.pay}
        </Button>
      ) : null}
    </Card>
  );
}

export function JoinTournamentForm({
  code,
  ownedGroups,
}: {
  code: string;
  ownedGroups: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(ownedGroups[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (ownedGroups.length === 0) {
    return <p className="text-sm text-ink-500">{t.tournaments.joinNoGroup}</p>;
  }

  function join() {
    setError(null);
    startTransition(async () => {
      const result = await joinTournamentAction(code, groupId);
      if (!result.ok) return setError(result.error);
      router.push(`/app/tournaments/${result.tournamentId}`);
    });
  }

  return (
    <>
      <Field label={t.tournaments.joinPickGroup} htmlFor="join-group">
        <Select id="join-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {ownedGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      {error ? <p className="mt-2 text-sm text-clay-700">{error}</p> : null}
      <Button type="button" onClick={join} disabled={pending} className="mt-3 w-full">
        {t.tournaments.joinCta}
      </Button>
    </>
  );
}

/**
 * ช่วงเวลาครึ่งชั่วโมงที่สนามแบดเปิดจริง (LSN-0040)
 * กดเลือกจากรายการเร็วกว่าและผิดยากกว่าการพิมพ์เวลาเองบนมือถือ
 */
const TIME_SLOTS = Array.from({ length: 36 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

/** วันก่อนวันแข่ง n วัน ในรูปแบบ yyyy-mm-dd — ใช้กับปุ่มลัด */
/**
 * สร้างทัวร์นาเมนต์ (LSN-0032)
 *
 * ตารางบังคับกติกาของวันเวลาและจำนวนทีมไว้แล้วด้วย check constraint แต่
 * `create_tournament` ไม่ได้ตรวจอะไรเลยก่อน insert — constraint จึงดังเป็น error
 * ดิบซึ่ง `call()` แปลงเป็น "เกิดข้อผิดพลาด" ที่ผู้ใช้ทำอะไรต่อไม่ถูก
 *
 * ฟอร์มจึงตรวจกติกาชุดเดียวกันก่อนยิง เพื่อให้ได้ข้อความที่บอกว่าต้องแก้ตรงไหน
 * **ไม่ใช่การย้ายด่านมาไว้ที่หน้าจอ** — ด่านจริงยังอยู่ที่ตาราง ตรงนี้คือการแปล
 */
export function CreateTournamentForm({
  ownedGroups,
  initial,
}: {
  ownedGroups: { id: string; name: string }[];
  /** ค่าจากงานเดิมเมื่อกด "จัดครั้งถัดไป" — ไม่มีวันเวลาโดยตั้งใจ (LSN-0038) */
  initial?: {
    hostGroupId: string;
    title: string;
    tier: string;
    entryFeeThb: number;
    minTeams: number;
    maxTeams: number | null;
  } | null;
}) {
  const router = useRouter();
  const [hostGroupId, setHostGroupId] = useState(
    initial?.hostGroupId ?? ownedGroups[0]?.id ?? '',
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [tier, setTier] = useState(initial?.tier ?? 'P');
  /**
   * วันแข่งถามครั้งเดียว (LSN-0040)
   *
   * ตารางรองรับงานข้ามวันได้ แต่ฟอร์มไม่เปิดให้ เพราะงานแบดสมัครเล่นเกือบทั้งหมด
   * จบในวันเดียว การถามวันสองครั้งจึงเป็นแค่ช่องให้เผลอตั้งคนละวัน
   * ถ้าวันหนึ่งต้องรองรับจริง ให้เพิ่มสวิตช์ "งานข้ามวัน" ไม่ใช่ย้อนกลับไปถามสองครั้ง
   */
  const [matchDate, setMatchDate] = useState('');
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('22:00');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [minTeams, setMinTeams] = useState(initial?.minTeams ?? 4);
  const [maxTeams, setMaxTeams] = useState(
    initial?.maxTeams != null ? String(initial.maxTeams) : '',
  );
  const [entryFee, setEntryFee] = useState(initial?.entryFeeThb ?? 800);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);

    if (!matchDate || !deadlineDate) return setError(t.tournaments.dateRequired);
    if (endTime <= startTime) return setError(t.tournaments.endBeforeStart);
    // ปิดรับสมัคร 23:59 ของวันที่เลือก และบังคับให้เป็นวันก่อนวันแข่ง
    // จึงไม่มีทางชน constraint registration_deadline <= starts_at ไม่ว่าแข่งกี่โมง
    if (deadlineDate >= matchDate) return setError(t.tournaments.deadlineNotBeforeMatch);

    const s = new Date(`${matchDate}T${startTime}`);
    const e = new Date(`${matchDate}T${endTime}`);
    const d = new Date(`${deadlineDate}T23:59`);
    if (minTeams < 2) return setError(t.tournaments.minTeamsTooLow);

    const max = maxTeams.trim() === '' ? null : Number(maxTeams);
    if (max !== null && max < minTeams) return setError(t.tournaments.maxLessThanMin);
    if (entryFee < 1 || entryFee > 100000) return setError(t.tournaments.entryFeeRange);

    startTransition(async () => {
      const result = await createTournamentAction({
        hostGroupId,
        title,
        startsAt: s.toISOString(),
        endsAt: e.toISOString(),
        deadline: d.toISOString(),
        minTeams,
        maxTeams: max,
        entryFeeThb: entryFee,
        tier,
      });
      if (!result.ok) return setError(result.error);
      router.push(`/app/tournaments/${result.tournamentId}`);
    });
  }

  return (
    <Card className="px-5 py-4">
      {/* Field ตัวเดียวไม่มีระยะห่างในตัว พอเรียงเก้าช่องจึงต้องมีตัวคุมระยะให้ */}
      <div className="grid gap-3.5">
      <Field
        label={t.tournaments.hostGroupField}
        htmlFor="tn-group"
        hint={t.tournaments.hostGroupHint}
      >
        <Select id="tn-group" value={hostGroupId} onChange={(ev) => setHostGroupId(ev.target.value)}>
          {ownedGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t.tournaments.titleField} htmlFor="tn-title">
        <Input
          id="tn-title"
          value={title}
          maxLength={120}
          onChange={(ev) => setTitle(ev.target.value)}
        />
      </Field>

      <Field label={t.tournaments.tierField} htmlFor="tn-tier" hint={t.tournaments.tierNote}>
        <Select id="tn-tier" value={tier} onChange={(ev) => setTier(ev.target.value)}>
          {TIERS.map((x) => (
            <option key={x.value} value={x.value}>
              {x.value} · {x.name}
            </option>
          ))}
        </Select>
        {/* ตัวอย่างของรุ่นที่เลือกอยู่ — อยู่นอกช่องเลือกเพื่อให้ข้อความในช่อง
            สั้นพอที่จะอ่านครบบนมือถือ */}
        {tierExample(tier) ? (
          <p className="mt-1.5 text-xs font-medium text-brand-700">{tierExample(tier)}</p>
        ) : null}
      </Field>

      <ThaiDateField
        id="tn-date"
        label={t.tournaments.matchDateField}
        value={matchDate}
        onChange={setMatchDate}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.tournaments.startTimeField} htmlFor="tn-start-time">
          <Select
            id="tn-start-time"
            value={startTime}
            onChange={(ev) => setStartTime(ev.target.value)}
          >
            {TIME_SLOTS.map((x) => (
              <option key={x} value={x}>
                {x} น.
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.tournaments.endTimeField} htmlFor="tn-end-time">
          <Select
            id="tn-end-time"
            value={endTime}
            onChange={(ev) => setEndTime(ev.target.value)}
          >
            {TIME_SLOTS.map((x) => (
              <option key={x} value={x}>
                {x} น.
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <ThaiDateField
        id="tn-deadline"
        label={t.tournaments.deadlineDateField}
        hint={t.tournaments.deadlineDateHint}
        value={deadlineDate}
        onChange={setDeadlineDate}
      />

      <div>
        <div className="mt-2 flex flex-wrap gap-2">
          {([7, 14] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setDeadlineDate(dateMinusDays(matchDate, days))}
              disabled={!matchDate}
              className="focus-ring rounded-full border border-ink-300 px-3 py-1 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-45"
            >
              {days === 7 ? t.tournaments.quickWeek : t.tournaments.quickTwoWeeks}
            </button>
          ))}
          {!matchDate ? (
            <span className="self-center text-xs text-ink-500">
              {t.tournaments.pickMatchDateFirst}
            </span>
          ) : null}
        </div>
      </div>

      <Field label={t.tournaments.minTeamsField} htmlFor="tn-min">
        <Input
          id="tn-min"
          type="number"
          min={2}
          value={minTeams}
          onChange={(ev) => setMinTeams(Number(ev.target.value))}
        />
      </Field>

      <Field label={t.tournaments.maxTeamsField} htmlFor="tn-max">
        <Input
          id="tn-max"
          type="number"
          min={2}
          value={maxTeams}
          placeholder="ไม่จำกัด"
          onChange={(ev) => setMaxTeams(ev.target.value)}
        />
      </Field>

      <Field label={t.tournaments.entryFeeField} htmlFor="tn-fee">
        <Input
          id="tn-fee"
          type="number"
          min={1}
          max={100000}
          value={entryFee}
          onChange={(ev) => setEntryFee(Number(ev.target.value))}
        />
      </Field>

      </div>

      {/* ทวนเป็นภาษาคนก่อนกด — ที่ผ่านมาต้องไล่อ่านทีละช่องเอง (LSN-0040) */}
      {matchDate && deadlineDate ? (
        <div className="mt-4 rounded-xl bg-brand-50 px-4 py-3">
          <p className="text-xs font-semibold text-brand-800">{t.tournaments.summaryTitle}</p>
          <p className="mt-1 text-sm leading-relaxed text-brand-900">
            {t.tournaments.summary(
              formatDate(`${matchDate}T${startTime}`),
              startTime,
              endTime,
              formatDate(`${deadlineDate}T12:00`),
            )}
          </p>
        </div>
      ) : null}

      {/* ข้อความผิดพลาดต้องอยู่ติดปุ่มและแยกจากคำอธิบายอื่น เพราะเดิมมันไปแปะ
          ชิดกับโน้ตเรื่องฉบับร่าง แล้วอ่านรวมกันเหมือนเป็นประโยคเดียว */}
      {error ? (
        <p className="mt-4 rounded-xl bg-clay-50 px-4 py-3 text-sm font-medium text-clay-900">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        onClick={submit}
        disabled={pending || title.trim().length === 0 || !hostGroupId}
        className="mt-4 w-full"
      >
        {t.tournaments.create}
      </Button>

      <p className="mt-2 text-center text-xs text-ink-500">{t.tournaments.draftNote}</p>
    </Card>
  );
}
