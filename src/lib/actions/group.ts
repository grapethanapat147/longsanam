'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { reasonLabel, t } from '@/i18n';

/**
 * ก๊วน — กลุ่มคนที่คงอยู่ข้ามนัด (LSN-0026)
 *
 * ทุกการเขียนผ่าน RPC ไม่ใช่ insert ตรง เพราะกติกาอย่าง "ผู้สร้างเป็นเจ้าของ
 * ทันที" และ "เจ้าของออกไม่ได้" ต้องอยู่ที่ฐานข้อมูล ไม่ใช่ที่หน้าจอ
 * ฝั่ง UI จึงห้ามเป็นที่เดียวที่บังคับกติกาเหล่านี้
 */

export type GroupResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function callGroupRpc<T extends Record<string, unknown>>(
  fn: 'create_group' | 'join_group' | 'leave_group' | 'archive_group',
  args: Record<string, unknown>,
  pick: (row: Record<string, unknown>) => T,
): Promise<GroupResult<T>> {
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

  revalidatePath('/app/groups', 'layout');
  return { ok: true, ...pick(result as Record<string, unknown>) };
}

export async function createGroupAction(
  name: string,
  sportId: string,
  homeDistrict: string,
): Promise<GroupResult<{ groupId: string; publicCode: string }>> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: t.groups.nameRequired };
  if (trimmed.length > 80) return { ok: false, error: t.groups.nameTooLong };

  return callGroupRpc(
    'create_group',
    { p_name: trimmed, p_sport_id: sportId, p_home_district: homeDistrict.trim() || null },
    (r) => ({ groupId: String(r.groupId ?? ''), publicCode: String(r.publicCode ?? '') }),
  );
}

export async function joinGroupAction(code: string): Promise<GroupResult<{ groupId: string }>> {
  return callGroupRpc('join_group', { p_code: code.trim().toUpperCase() }, (r) => ({
    groupId: String(r.groupId ?? ''),
  }));
}

export async function leaveGroupAction(groupId: string): Promise<GroupResult> {
  return callGroupRpc('leave_group', { p_group_id: groupId }, () => ({}) as never);
}

export async function archiveGroupAction(groupId: string): Promise<GroupResult> {
  return callGroupRpc('archive_group', { p_group_id: groupId }, () => ({}) as never);
}
