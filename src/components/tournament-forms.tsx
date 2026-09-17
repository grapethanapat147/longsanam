'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  confirmTournamentCourtAction,
  joinTournamentAction,
  payTournamentTeamAction,
  publishTournamentAction,
} from '@/lib/actions/tournament';
import { Button, Card, Field, Input, Select } from '@/components/ui/primitives';
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
