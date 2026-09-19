import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Alert, ButtonLink, Card, PageHeader } from '@/components/ui/primitives';
import { JoinTournamentForm } from '@/components/tournament-forms';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { formatDate, formatThb } from '@/lib/format';
import { t } from '@/i18n';
import { tierLabel } from '@/lib/domain/tiers';

export const metadata: Metadata = { title: t.tournaments.joinTitle };

type Params = { params: Promise<{ code: string }> };

type Invite = {
  title: string;
  tier: string;
  entryFeeThb: number;
  minTeams: number;
  maxTeams: number | null;
  teamCount: number;
  startsAt: string;
  registrationDeadline: string;
  status: string;
};

/**
 * หน้ารับสมัคร — เปิดได้โดยไม่ต้องล็อกอิน
 *
 * RPC คืนเฉพาะจำนวนทีม **ไม่คืนว่าก๊วนไหนสมัครแล้ว** ด้วยเหตุผลเดียวกับ
 * หน้ารับเชิญก๊วน: RLS เป็น row-level ไม่ใช่ column-level การเปิดให้คนนอก
 * อ่านแถวได้จะเปิดทั้งแถว
 */
export default async function TournamentInvitePage({ params }: Params) {
  const { code } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.rpc as any)('tournament_invite_public', { p_code: code });
  const invite = (data ?? null) as Invite | null;
  if (!invite) notFound();

  let ownedGroups: { id: string; name: string }[] = [];
  if (user) {
    const { data: rows } = await supabase
      .from('group_members')
      .select('group_id, groups (id, name)')
      .eq('user_id', user.id)
      .eq('role', 'owner');
    ownedGroups = (rows ?? [])
      .map((r) => r.groups)
      .filter((g): g is { id: string; name: string } => g !== null);
  }

  const open = invite.status === 'open';

  return (
    <AppShell>
      <PageHeader
        title={invite.title}
        description={`${formatDate(invite.startsAt)} · ${t.tournaments.tierField} ${tierLabel(invite.tier)} · ${formatThb(invite.entryFeeThb)} ต่อก๊วน`}
      />

      <Card className="px-5 py-5">
        <p className="text-sm text-ink-700">
          {t.tournaments.teamCount(invite.teamCount, invite.minTeams)}
        </p>
        <p className="mt-1 text-xs text-ink-500">
          {t.tournaments.deadlineHint(formatDate(invite.registrationDeadline))}
        </p>

        <div className="mt-4">
          {!open ? (
            <Alert tone="warning">{t.tournaments.tournamentClosedNote}</Alert>
          ) : user ? (
            <JoinTournamentForm code={code} ownedGroups={ownedGroups} />
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-500">{t.groups.joinSignInFirst}</p>
              <ButtonLink href={`/auth/sign-in?next=/t/${code}`}>{t.auth.signInTitle}</ButtonLink>
            </>
          )}
        </div>
      </Card>
    </AppShell>
  );
}
