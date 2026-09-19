import type { Metadata } from 'next';
import { AppShell } from '@/components/shell';
import {
  Alert,
  ButtonLink,
  Card,
  Chip,
  EmptyState,
  PageHeader,
} from '@/components/ui/primitives';
import { ShareLink } from '@/components/share-link';
import { TournamentControls } from '@/components/tournament-forms';
import { MatchList, RecordMatchForm, type MatchRow } from '@/components/match-controls';
import { RateEventForm, RatePlayersForm } from '@/components/impression-forms';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { formatDate, formatThb, tournamentShareUrl } from '@/lib/format';
import { t } from '@/i18n';
import { tierLabel } from '@/lib/domain/tiers';

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

  // แมตช์ · RLS คืนเฉพาะงานที่ผู้ใช้เกี่ยวข้องอยู่แล้ว
  const { data: matchRows } = await supabase
    .from('matches')
    .select('id, court_label, score_a, score_b, status, side_a_group_id, side_b_group_id, recorded_by')
    .eq('tournament_id', id)
    .order('played_at', { ascending: false });

  // สมาชิกของทุกก๊วนในงาน ใช้ตัดสินว่าผู้ใช้ยืนยันแมตช์ไหนได้
  const { data: allMembers } = await supabase
    .from('group_members')
    .select('group_id, user_id, profiles (display_name)')
    .in('group_id', (teams ?? []).map((team) => team.group_id));

  /**
   * ให้คะแนนความประทับใจได้เมื่องานเดินถึงจุดที่เจอกันจริงแล้ว (LSN-0039)
   *
   * รายชื่อที่ให้คะแนนได้คือ **สมาชิกของก๊วนอื่นที่ผู้ใช้ไม่ได้อยู่ด้วย**
   * ด่านจริงอยู่ที่ RPC ตรงนี้แค่ไม่แสดงปุ่มที่กดไปก็โดนปฏิเสธอยู่ดี
   */
  const canRate = ['ready', 'booked', 'completed'].includes(x.status);

  const { data: myImpressions } = canRate
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)('my_player_impressions', { p_tournament_id: id })
    : { data: {} };

  const membersByGroup = new Map<string, { id: string; name: string }[]>();
  for (const m of allMembers ?? []) {
    const list = membersByGroup.get(m.group_id) ?? [];
    list.push({ id: m.user_id, name: m.profiles?.display_name ?? 'ผู้เล่น' });
    membersByGroup.set(m.group_id, list);
  }
  const groupName = new Map((teams ?? []).map((team) => [team.group_id, team.groups?.name ?? 'ก๊วน']));
  const inGroup = (gid: string) => (membersByGroup.get(gid) ?? []).some((p) => p.id === user.id);

  // ก๊วนของผู้ใช้ในงานนี้ · คนหนึ่งอยู่ได้หลายก๊วน (LSN-0026) จึงเป็น Set ไม่ใช่ค่าเดียว
  const myGroupIds = new Set((teams ?? []).map((tm) => tm.group_id).filter(inGroup));

  // ให้คะแนนได้เฉพาะคนที่ไม่ได้อยู่ก๊วนเดียวกับเราเลยสักก๊วน
  const rateablePlayers = (teams ?? [])
    .filter((tm) => !myGroupIds.has(tm.group_id))
    .flatMap((tm) => membersByGroup.get(tm.group_id) ?? [])
    .filter((pl) => pl.id !== user.id)
    .filter(
      (pl) => ![...myGroupIds].some((gid) =>
        (membersByGroup.get(gid) ?? []).some((mine) => mine.id === pl.id),
      ),
    );

  /*
    ตัดสินที่เซิร์ฟเวอร์ว่าใครยืนยันแมตช์ไหนได้ ด้วยกติกาเดียวกับ RPC
    คือต้องอยู่ฝั่งตรงข้ามกับผู้บันทึก และไม่อยู่ทั้งสองฝั่ง

    ตรงนี้เป็นแค่การซ่อนปุ่มให้หน้าจอไม่หลอกคน **ด่านจริงอยู่ที่ RPC และ
    ที่ constraint ระดับตาราง** ถ้าตรงนี้คำนวณผิดก็แค่ปุ่มโผล่ผิด กดแล้วยังถูกปฏิเสธ
  */
  const matches: MatchRow[] = (matchRows ?? []).map((m) => {
    const meInA = inGroup(m.side_a_group_id);
    const meInB = inGroup(m.side_b_group_id);
    const recorderInA = (membersByGroup.get(m.side_a_group_id) ?? []).some(
      (p) => p.id === m.recorded_by,
    );
    const canConfirm =
      m.status === 'recorded' &&
      !(meInA && meInB) &&
      (meInA || meInB) &&
      (recorderInA ? meInB : meInA);

    return {
      id: m.id,
      courtLabel: m.court_label,
      scoreA: m.score_a,
      scoreB: m.score_b,
      status: m.status as MatchRow['status'],
      sideAName: groupName.get(m.side_a_group_id) ?? 'ก๊วน',
      sideBName: groupName.get(m.side_b_group_id) ?? 'ก๊วน',
      canConfirm,
      canVoid: isHost,
    };
  });

  const teamCount = (teams ?? []).length;
  const gateTeams = teamCount >= x.min_teams;
  const gateMoney = teamCount > 0 && (teams ?? []).every((team) => paidGroups.has(team.group_id));
  const gateCourt = x.court_confirmed_at !== null;

  return (
    <AppShell>
      <PageHeader
        title={x.title}
        description={`${formatDate(x.starts_at)} · ${t.tournaments.tierField} ${tierLabel(x.tier)} · ${formatThb(x.entry_fee_thb)} ต่อก๊วน`}
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

      {canRate && myGroupIds.size > 0 ? (
        <div className="mt-4 grid gap-4">
          <RatePlayersForm
            tournamentId={x.id}
            players={rateablePlayers}
            existing={(myImpressions ?? {}) as Record<
              string,
              { punctuality: number; manners: number; fun: number }
            >}
          />
          {!isHost ? <RateEventForm tournamentId={x.id} /> : null}
        </div>
      ) : null}

      {/* งานประจำจัดซ้ำด้วยค่าเดิมเกือบทั้งหมด เหลือแค่วันที่ต้องเปลี่ยน (LSN-0038) */}
      {isHost ? (
        <div className="mt-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="font-medium text-ink-800">{t.tournaments.repeat}</p>
              <p className="mt-0.5 text-xs text-ink-500">{t.tournaments.repeatHint}</p>
            </div>
            <ButtonLink href={`/app/tournaments/new?from=${x.id}`} variant="secondary">
              {t.tournaments.repeat}
            </ButtonLink>
          </Card>
        </div>
      ) : null}

      <div className="mt-4">
        <MatchList matches={matches} />
      </div>

      {myTeam && x.status === 'ready' ? (
        <RecordMatchForm
          tournamentId={x.id}
          sideAGroupId={myTeam.group_id}
          sideBGroupId={
            (teams ?? []).find((team) => team.group_id !== myTeam.group_id)?.group_id ?? ''
          }
          sideAPlayers={membersByGroup.get(myTeam.group_id) ?? []}
          sideBPlayers={
            membersByGroup.get(
              (teams ?? []).find((team) => team.group_id !== myTeam.group_id)?.group_id ?? '',
            ) ?? []
          }
        />
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
