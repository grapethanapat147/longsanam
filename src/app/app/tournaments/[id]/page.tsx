import type { Metadata } from 'next';
import { AppShell } from '@/components/shell';
import { Alert, Card, Chip, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ShareLink } from '@/components/share-link';
import { TournamentControls } from '@/components/tournament-forms';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { formatDate, formatThb, tournamentShareUrl } from '@/lib/format';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t.tournaments.title };

type Params = { params: Promise<{ id: string }> };

export default async function TournamentPage({ params }: Params) {
  const { id } = await params;
  const user = await requireUser(`/app/tournaments/${id}`);
  const supabase = await createClient();

  const { data: x } = await supabase
    .from('tournaments')
    .select(
      'id, public_code, title, tier, status, starts_at, registration_deadline, entry_fee_thb, min_teams, max_teams, court_confirmed_at, venue_note, host_group_id',
    )
    .eq('id', id)
    .maybeSingle();

  // ข้อความเดียวกันทั้งกรณีไม่มีจริงและไม่มีสิทธิ์ เพื่อไม่บอกคนนอกว่างานนี้มีอยู่
  if (!x) {
    return (
      <AppShell>
        <PageHeader title={t.tournaments.title} />
        <EmptyState title={t.tournaments.notFoundOrNotMember} />
      </AppShell>
    );
  }

  const { data: teams } = await supabase
    .from('tournament_teams')
    .select('group_id, is_host, groups (name)')
    .eq('tournament_id', id)
    .order('is_host', { ascending: false });

  const { data: payments } = await supabase
    .from('tournament_team_payments')
    .select('group_id, status')
    .eq('tournament_id', id);

  const paidGroups = new Set(
    (payments ?? []).filter((p) => p.status === 'paid').map((p) => p.group_id),
  );

  const { data: myOwned } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('role', 'owner');

  const ownedIds = new Set((myOwned ?? []).map((m) => m.group_id));
  const isHost = ownedIds.has(x.host_group_id);
  const myTeam = (teams ?? []).find((team) => ownedIds.has(team.group_id));

  const teamCount = (teams ?? []).length;
  const gateTeams = teamCount >= x.min_teams;
  const gateMoney = teamCount > 0 && (teams ?? []).every((team) => paidGroups.has(team.group_id));
  const gateCourt = x.court_confirmed_at !== null;

  return (
    <AppShell>
      <PageHeader
        title={x.title}
        description={`${formatDate(x.starts_at)} · ${t.tournaments.tierField} ${x.tier} · ${formatThb(x.entry_fee_thb)} ต่อก๊วน`}
      />

      {x.status === 'cancelled' ? <Alert tone="warning">{t.tournaments.cancelledNote}</Alert> : null}

      {/* ประตูสามบาน — แสดงเป็นรายการอิสระ ไม่ใช่ขั้นตอนเรียงลำดับ
          เพราะกติกาคือครบเมื่อไรก็พร้อม ไม่มีอันไหนต้องมาก่อนอันไหน */}
      <Card className="px-5 py-4">
        <p className="font-medium text-ink-800">{t.tournaments.gates}</p>
        <p className="mt-1 text-sm text-ink-500">{t.tournaments.gatesHint}</p>
        <ul className="mt-3 grid gap-2">
          {[
            [t.tournaments.gateTeams, gateTeams, t.tournaments.teamCount(teamCount, x.min_teams)],
            [t.tournaments.gateMoney, gateMoney, `${paidGroups.size}/${teamCount}`],
            [t.tournaments.gateCourt, gateCourt, x.venue_note ?? ''],
          ].map(([label, done, detail]) => (
            <li key={String(label)} className="flex items-center justify-between gap-2">
              <span className="text-sm text-ink-900">{String(label)}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-ink-500">{String(detail)}</span>
                <Chip tone={done ? 'success' : 'warning'}>
                  {done ? t.tournaments.gateDone : t.tournaments.gatePending}
                </Chip>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-500">
          {t.tournaments.deadlineHint(formatDate(x.registration_deadline))}
        </p>
      </Card>

      <Card className="mt-4 px-5 py-4">
        <p className="font-medium text-ink-800">{t.tournaments.teams}</p>
        <ul className="mt-2 divide-y divide-ink-200">
          {(teams ?? []).map((team) => (
            <li key={team.group_id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                {team.groups?.name ?? 'ก๊วน'}
              </span>
              {team.is_host ? <Chip tone="neutral">{t.tournaments.hostChip}</Chip> : null}
              <Chip tone={paidGroups.has(team.group_id) ? 'success' : 'warning'}>
                {paidGroups.has(team.group_id) ? t.tournaments.paid : t.tournaments.unpaid}
              </Chip>
            </li>
          ))}
        </ul>
      </Card>

      {isHost && x.public_code && x.status === 'open' ? (
        <div className="mt-4">
          <ShareLink
            url={tournamentShareUrl(x.public_code)}
            title={t.tournaments.joinTitle}
            hint={t.tournaments.gatesHint}
            inputLabel={t.tournaments.joinTitle}
          />
        </div>
      ) : null}

      <div className="mt-4">
        <TournamentControls
          tournamentId={x.id}
          isHost={isHost}
          status={x.status}
          courtConfirmed={gateCourt}
          myGroupId={myTeam?.group_id ?? null}
          myTeamPaid={myTeam ? paidGroups.has(myTeam.group_id) : false}
        />
      </div>
    </AppShell>
  );
}
