'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { processRefund } from '@/lib/actions/participation';
import { runLifecycleSweeps } from '@/lib/lifecycle';
import { reasonLabel, t } from '@/i18n';
import type { AppRole } from '@/lib/domain/types';

/**
 * Platform admin actions.
 *
 * Every one re-checks the caller's role on the server before touching the
 * service-role client, because that client bypasses RLS entirely.
 */

async function requirePlatformAdmin(): Promise<{ id: string } | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'platform_admin') return null;
  return { id: user.id };
}

const manualRefundSchema = z.object({
  paymentId: z.string().uuid(),
  amountThb: z.coerce.number().int().min(1, 'จำนวนเงินต้องมากกว่า 0'),
  reason: z.string().trim().min(3, 'กรุณาระบุเหตุผล').max(300),
});

export type AdminActionState = { ok: boolean; error?: string; message?: string };

/**
 * Dispute support: refund a payment outside the normal cancellation flow.
 * The amount is still clamped to the original payment inside the database.
 */
export async function manualRefundAction(
  _prev: AdminActionState | null,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { ok: false, error: reasonLabel.forbidden };

  const parsed = manualRefundSchema.safeParse({
    paymentId: formData.get('paymentId'),
    amountThb: formData.get('amountThb'),
    reason: formData.get('reason'),
  });

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const client = createAdminClient();
  const { data: payment } = await client
    .from('payments')
    .select('id, participant_id, amount_thb, status')
    .eq('id', parsed.data.paymentId)
    .maybeSingle();

  if (!payment) return { ok: false, error: reasonLabel.payment_not_found };
  if (payment.status !== 'paid') {
    return { ok: false, error: 'คืนเงินได้เฉพาะรายการที่ชำระเงินสำเร็จแล้วเท่านั้น' };
  }
  if (parsed.data.amountThb > payment.amount_thb) {
    return { ok: false, error: 'จำนวนเงินคืนมากกว่ายอดที่ชำระไว้' };
  }

  const { data } = await client.rpc('cancel_participation', {
    p_participant_id: payment.participant_id,
    p_refund_thb: parsed.data.amountThb,
    p_reason: `[ผู้ดูแลระบบ] ${parsed.data.reason}`,
    p_policy_snapshot: { rule: 'manual_admin_refund', by: admin.id },
    p_idempotency_key: `admin-refund:${payment.id}:${parsed.data.amountThb}`,
    p_actor: admin.id,
  });

  const result = data as { ok?: boolean; reason?: string; refundId?: string } | null;
  if (!result?.ok) {
    return { ok: false, error: reasonLabel[result?.reason ?? ''] ?? t.common.unexpectedError };
  }

  if (result.refundId) {
    await processRefund(result.refundId, admin.id);
  }

  revalidatePath('/admin', 'layout');
  return { ok: true, message: `บันทึกการคืนเงิน ${parsed.data.amountThb} บาท เรียบร้อย` };
}

export async function setUserRoleAction(
  userId: string,
  role: AppRole,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { ok: false, error: reasonLabel.forbidden };

  if (userId === admin.id) {
    return { ok: false, error: 'ไม่สามารถเปลี่ยนสิทธิ์ของบัญชีตัวเองได้' };
  }

  const client = createAdminClient();
  const { data: before } = await client
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  const { error } = await client.from('profiles').update({ role }).eq('id', userId);
  if (error) return { ok: false, error: t.common.unexpectedError };

  await client.rpc('app_log', {
    p_actor: admin.id,
    p_entity_type: 'profile',
    p_entity_id: userId,
    p_session_id: undefined,
    p_action: 'profile.role_changed',
    p_from: before?.role ?? undefined,
    p_to: role,
    p_metadata: {},
  });

  revalidatePath('/admin/users');
  return { ok: true };
}

export async function setVenueActiveAction(
  venueId: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { ok: false, error: reasonLabel.forbidden };

  const client = createAdminClient();
  const { error } = await client.from('venues').update({ is_active: isActive }).eq('id', venueId);
  if (error) return { ok: false, error: t.common.unexpectedError };

  await client.rpc('app_log', {
    p_actor: admin.id,
    p_entity_type: 'venue',
    p_entity_id: venueId,
    p_session_id: undefined,
    p_action: isActive ? 'venue.activated' : 'venue.deactivated',
    p_from: isActive ? 'inactive' : 'active',
    p_to: isActive ? 'active' : 'inactive',
    p_metadata: {},
  });

  revalidatePath('/admin/venues');
  return { ok: true };
}

/**
 * Runs the expiry sweeps on demand. The same routines run on a schedule via
 * /api/cron/expire; exposing them here makes the behaviour demonstrable.
 */
export async function runMaintenanceAction(): Promise<AdminActionState> {
  const admin = await requirePlatformAdmin();
  if (!admin) return { ok: false, error: reasonLabel.forbidden };

  const result = await runLifecycleSweeps();

  revalidatePath('/admin', 'layout');

  return {
    ok: true,
    message:
      `หมดอายุ: การกันคอร์ต ${result.expiredHolds} · การจอง ${result.expiredBookings} · ` +
      `การชำระเงิน ${result.expiredPayments} · สิทธิ์คิวสำรอง ${result.expiredPromotions} — ` +
      `จบก๊วน ${result.completedSessions} รายการ` +
      (result.strandedSessions > 0
        ? ` · ยกเลิกก๊วนที่จองสนามไม่ทัน ${result.strandedSessions} รายการ ` +
          `คืนเงินผู้เล่น ${result.refundedPlayers} คน รวม ${result.refundedThb} บาท`
        : ''),
  };
}
