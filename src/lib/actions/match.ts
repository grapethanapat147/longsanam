'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { reasonLabel, t } from '@/i18n';

/**
 * ผลแมตช์ (LSN-0030)
 *
 * ทุกการเขียนผ่าน RPC เพราะกติกาที่สำคัญที่สุดของตั๋วนี้ — **คนที่บันทึกและ
 * เพื่อนร่วมก๊วนของเขายืนยันไม่ได้** — ต้องอยู่ที่ฐานข้อมูล ไม่ใช่ที่หน้าจอ
 * ถ้ากติกานี้อยู่แค่ใน UI คะแนนฝีมือใน LSN-0031 ก็ไม่มีความหมาย
 */

export type MatchResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

type Rpc = 'record_match' | 'confirm_match' | 'dispute_match' | 'void_match';

async function call<T extends Record<string, unknown>>(
  fn: Rpc,
  args: Record<string, unknown>,
  pick: (row: Record<string, unknown>) => T,
): Promise<MatchResult<T>> {
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

export async function recordMatchAction(input: {
  tournamentId: string;
  sideAGroupId: string;
  sideBGroupId: string;
  sideAPlayers: string[];
  sideBPlayers: string[];
  scoreA: number;
  scoreB: number;
  courtLabel: string;
}): Promise<MatchResult<{ matchId: string }>> {
  if (input.sideAPlayers.length === 0 || input.sideBPlayers.length === 0) {
    return { ok: false, error: t.matches.pickPlayers };
  }
  if (input.scoreA === input.scoreB) {
    return { ok: false, error: t.matches.scoreTie };
  }

  return call(
    'record_match',
    {
      p_tournament_id: input.tournamentId,
      p_side_a_group: input.sideAGroupId,
      p_side_b_group: input.sideBGroupId,
      p_side_a_players: input.sideAPlayers,
      p_side_b_players: input.sideBPlayers,
      p_score_a: Math.round(input.scoreA),
      p_score_b: Math.round(input.scoreB),
      p_court_label: input.courtLabel.trim() || null,
    },
    (r) => ({ matchId: String(r.matchId ?? '') }),
  );
}

export async function confirmMatchAction(matchId: string): Promise<MatchResult> {
  return call('confirm_match', { p_match_id: matchId }, () => ({}) as never);
}

export async function disputeMatchAction(matchId: string, note: string): Promise<MatchResult> {
  return call('dispute_match', { p_match_id: matchId, p_note: note.trim() || null }, () => ({}) as never);
}

export async function voidMatchAction(matchId: string, reason: string): Promise<MatchResult> {
  return call('void_match', { p_match_id: matchId, p_reason: reason.trim() || null }, () => ({}) as never);
}
