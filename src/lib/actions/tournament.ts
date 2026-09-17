'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { reasonLabel, t } from '@/i18n';

/**
 * ทัวร์นาเมนต์ (LSN-0029)
 *
 * ทุกการเขียนผ่าน RPC เพราะกติกาสามข้อที่ตั๋วตัดสินไว้ต้องอยู่ที่ฐานข้อมูล
 * ไม่ใช่ที่หน้าจอ — เจ้าภาพนับเป็นหนึ่งทีมและต้องจ่าย · สามประตูอิสระต่อกัน ·
 * และค่าสมัครอยู่ในตารางของตัวเอง ไม่ปนกับ payments ของนัด
 */

export type TournamentResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

type Rpc =
  | 'create_tournament'
  | 'publish_tournament'
  | 'join_tournament'
  | 'pay_tournament_team'
  | 'confirm_tournament_court';

async function call<T extends Record<string, unknown>>(
  fn: Rpc,
  args: Record<string, unknown>,
  pick: (row: Record<string, unknown>) => T,
): Promise<TournamentResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(fn, args);

  if (error) {
    console.error(`[${fn}] failed`, error);
    return { ok: false, error: t.common.unexpectedError };
  }

  const result = (data ?? null) as { ok?: boolean; reason?: string } | null;
  if (!result?.ok) {
    const reason = result?.reason;
    return { ok: false, error: (reason && reasonLabel[reason]) || t.common.unexpectedError };
  }

  revalidatePath('/app/tournaments', 'layout');
  return { ok: true, ...pick(result as Record<string, unknown>) };
}

export async function createTournamentAction(input: {
  hostGroupId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  deadline: string;
  minTeams: number;
  maxTeams: number | null;
  entryFeeThb: number;
  tier: string;
}): Promise<TournamentResult<{ tournamentId: string; publicCode: string }>> {
  const title = input.title.trim();
  if (title.length === 0) return { ok: false, error: t.tournaments.titleRequired };

  return call(
    'create_tournament',
    {
      p_host_group_id: input.hostGroupId,
      p_title: title,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
      p_deadline: input.deadline,
      p_min_teams: input.minTeams,
      p_max_teams: input.maxTeams,
      p_entry_fee_thb: input.entryFeeThb,
      p_tier: input.tier,
    },
    (r) => ({
      tournamentId: String(r.tournamentId ?? ''),
      publicCode: String(r.publicCode ?? ''),
    }),
  );
}

export async function publishTournamentAction(id: string): Promise<TournamentResult> {
  return call('publish_tournament', { p_tournament_id: id }, () => ({}) as never);
}

export async function joinTournamentAction(
  code: string,
  groupId: string,
): Promise<TournamentResult<{ tournamentId: string }>> {
  return call('join_tournament', { p_code: code.trim().toUpperCase(), p_group_id: groupId }, (r) => ({
    tournamentId: String(r.tournamentId ?? ''),
  }));
}

export async function payTournamentTeamAction(
  tournamentId: string,
  groupId: string,
): Promise<TournamentResult> {
  return call(
    'pay_tournament_team',
    {
      p_tournament_id: tournamentId,
      p_group_id: groupId,
      p_idempotency_key: `tourn:${tournamentId}:${groupId}`,
    },
    () => ({}) as never,
  );
}

export async function confirmTournamentCourtAction(
  tournamentId: string,
  venueNote: string,
): Promise<TournamentResult> {
  return call(
    'confirm_tournament_court',
    { p_tournament_id: tournamentId, p_venue_note: venueNote.trim() || null },
    () => ({}) as never,
  );
}
