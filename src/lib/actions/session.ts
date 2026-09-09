'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { assertSessionTransition } from '@/lib/domain/state-machines';
import { runBookingOrchestration } from '@/lib/orchestration/book-session';
import { refundAllPaidParticipants } from '@/lib/refunds';
import { reasonLabel, t } from '@/i18n';

/** Bangkok wall-clock input from the form, stored as an absolute instant. */
function bangkokInstant(date: string, time: string): string {
  return `${date}T${time}:00+07:00`;
}

const createSessionSchema = z
  .object({
    sportId: z.string().uuid('กรุณาเลือกกีฬา'),
    title: z.string().trim().min(3, 'ตั้งชื่อก๊วนอย่างน้อย 3 ตัวอักษร').max(120),
    description: z.string().trim().max(500).optional(),
    areaText: z.string().trim().min(1, 'กรุณาระบุย่านหรือพื้นที่'),
    district: z.string().trim().max(80).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ไม่ถูกต้อง'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'เวลาเริ่มไม่ถูกต้อง'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'เวลาสิ้นสุดไม่ถูกต้อง'),
    budgetPerPersonThb: z.coerce.number().int().min(0).max(100000),
    targetPlayers: z.coerce.number().int().min(2, 'อย่างน้อย 2 คน').max(60),
    minPlayers: z.coerce.number().int().min(1).max(60),
    paymentDeadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    paymentDeadlineTime: z.string().regex(/^\d{2}:\d{2}$/),
    courtIds: z.array(z.string().uuid()).min(1, 'เลือกสนามอย่างน้อย 1 แห่ง'),
    fullRefundHoursBefore: z.coerce.number().int().min(0).max(720),
    partialRefundHoursBefore: z.coerce.number().int().min(0).max(720),
    partialRefundPercent: z.coerce.number().int().min(0).max(100),
    organizerCancelAlwaysFullRefund: z.boolean(),
  })
  .refine((v) => v.minPlayers <= v.targetPlayers, {
    message: 'จำนวนขั้นต่ำต้องไม่มากกว่าจำนวนเป้าหมาย',
    path: ['minPlayers'],
  })
  .refine((v) => v.startTime < v.endTime, {
    message: 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม',
    path: ['endTime'],
  })
  .refine((v) => v.partialRefundHoursBefore <= v.fullRefundHoursBefore, {
    message: 'ช่วงคืนเงินบางส่วนต้องอยู่ใกล้วันเล่นมากกว่าช่วงคืนเต็ม',
    path: ['partialRefundHoursBefore'],
  });

export type CreateSessionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createSessionAction(
  _prev: CreateSessionState | null,
  formData: FormData,
): Promise<CreateSessionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const parsed = createSessionSchema.safeParse({
    sportId: formData.get('sportId'),
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    areaText: formData.get('areaText'),
    district: formData.get('district') || undefined,
    date: formData.get('date'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    budgetPerPersonThb: formData.get('budgetPerPersonThb'),
    targetPlayers: formData.get('targetPlayers'),
    minPlayers: formData.get('minPlayers'),
    paymentDeadlineDate: formData.get('paymentDeadlineDate'),
    paymentDeadlineTime: formData.get('paymentDeadlineTime'),
    courtIds: formData.getAll('courtIds').map(String).filter(Boolean),
    fullRefundHoursBefore: formData.get('fullRefundHoursBefore'),
    partialRefundHoursBefore: formData.get('partialRefundHoursBefore'),
    partialRefundPercent: formData.get('partialRefundPercent'),
    organizerCancelAlwaysFullRefund: formData.get('organizerCancelAlwaysFullRefund') === 'on',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: parsed.error.issues[0]?.message, fieldErrors };
  }

  const v = parsed.data;
  const startsAt = bangkokInstant(v.date, v.startTime);
  const endsAt = bangkokInstant(v.date, v.endTime);
  const paymentDeadline = bangkokInstant(v.paymentDeadlineDate, v.paymentDeadlineTime);

  if (new Date(startsAt).getTime() <= Date.now()) {
    return {
      ok: false,
      error: 'วันเวลาที่เล่นต้องอยู่ในอนาคต',
      fieldErrors: { date: 'ต้องเป็นอนาคต' },
    };
  }
  if (new Date(paymentDeadline).getTime() > new Date(startsAt).getTime()) {
    return {
      ok: false,
      error: 'กำหนดชำระเงินต้องอยู่ก่อนเวลาเริ่มเล่น',
      fieldErrors: { paymentDeadlineDate: 'ต้องอยู่ก่อนเวลาเริ่ม' },
    };
  }

  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      organizer_id: user.id,
      sport_id: v.sportId,
      title: v.title,
      description: v.description ?? null,
      area_text: v.areaText,
      district: v.district ?? null,
      starts_at: startsAt,
      ends_at: endsAt,
      budget_per_person_thb: v.budgetPerPersonThb,
      target_players: v.targetPlayers,
      min_players: v.minPlayers,
      payment_deadline: paymentDeadline,
      status: 'draft',
      cancellation_policy: {
        fullRefundHoursBefore: v.fullRefundHoursBefore,
        partialRefundHoursBefore: v.partialRefundHoursBefore,
        partialRefundPercent: v.partialRefundPercent,
        noRefundWithinHours: v.partialRefundHoursBefore,
        organizerCancelAlwaysFullRefund: v.organizerCancelAlwaysFullRefund,
      },
    })
    .select('id')
    .single();

  if (error || !session) {
    return { ok: false, error: t.common.unexpectedError };
  }

  // Court ids arrive in the order the organizer ranked them.
  const admin = createAdminClient();
  const { data: courts } = await admin.from('courts').select('id, venue_id').in('id', v.courtIds);

  const venueByCourt = new Map((courts ?? []).map((c) => [c.id, c.venue_id]));

  const preferences = v.courtIds
    .map((courtId, index) => {
      const venueId = venueByCourt.get(courtId);
      if (!venueId) return null;
      return {
        session_id: session.id,
        venue_id: venueId,
        court_id: courtId,
        priority: index + 1,
        approved: true,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (preferences.length === 0) {
    await supabase.from('sessions').delete().eq('id', session.id);
    return {
      ok: false,
      error: 'ไม่พบคอร์ตที่เลือก กรุณาเลือกใหม่',
      fieldErrors: { courtIds: 'ไม่ถูกต้อง' },
    };
  }

  await supabase.from('session_venue_preferences').insert(preferences);

  revalidatePath('/organizer');
  redirect(`/organizer/sessions/${session.id}?created=1`);
}

export async function publishSessionAction(
  sessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  const { data: session } = await supabase
    .from('sessions')
    .select('id, status, organizer_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || session.organizer_id !== user.id) {
    return { ok: false, error: reasonLabel.forbidden };
  }

  try {
    assertSessionTransition(session.status, 'open');
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : t.common.unexpectedError,
    };
  }

  const { error } = await supabase.from('sessions').update({ status: 'open' }).eq('id', sessionId);
  if (error) return { ok: false, error: t.common.unexpectedError };

  const admin = createAdminClient();
  await admin.rpc('app_log', {
    p_actor: user.id,
    p_entity_type: 'session',
    p_entity_id: sessionId,
    p_session_id: sessionId,
    p_action: 'session.published',
    p_from: session.status,
    p_to: 'open',
    p_metadata: {},
  });

  revalidatePath('/organizer');
  revalidatePath('/discover');
  return { ok: true };
}

export async function setPreferenceApprovalAction(
  preferenceId: string,
  approved: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  // RLS restricts this update to the organizer of the owning session.
  const { data, error } = await supabase
    .from('session_venue_preferences')
    .update({ approved })
    .eq('id', preferenceId)
    .select('session_id')
    .maybeSingle();

  if (error || !data) return { ok: false, error: reasonLabel.forbidden };

  const admin = createAdminClient();
  await admin.rpc('app_log', {
    p_actor: user.id,
    p_entity_type: 'session_venue_preference',
    p_entity_id: preferenceId,
    p_session_id: data.session_id,
    p_action: approved ? 'preference.approved' : 'preference.unapproved',
    p_from: approved ? 'unapproved' : 'approved',
    p_to: approved ? 'approved' : 'unapproved',
    p_metadata: {},
  });

  revalidatePath(`/organizer/sessions/${data.session_id}`);
  return { ok: true };
}

export async function triggerBookingAction(
  sessionId: string,
): Promise<{ ok: boolean; outcome: string; message: string }> {
  const user = await getCurrentUser();
  if (!user)
    return {
      ok: false,
      outcome: 'forbidden',
      message: reasonLabel.not_authenticated,
    };

  const supabase = await createClient();
  const { data: session } = await supabase
    .from('sessions')
    .select('id, organizer_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || (session.organizer_id !== user.id && user.role !== 'platform_admin')) {
    return { ok: false, outcome: 'forbidden', message: reasonLabel.forbidden };
  }

  const result = await runBookingOrchestration(sessionId, { actorId: user.id });
  revalidatePath(`/organizer/sessions/${sessionId}`);
  revalidatePath('/venue', 'layout');

  switch (result.outcome) {
    case 'booked':
      return {
        ok: true,
        outcome: result.outcome,
        message: 'จองสนามสำเร็จแล้ว',
      };
    case 'awaiting_venue':
      return {
        ok: true,
        outcome: result.outcome,
        message: 'ส่งคำขอจองแล้ว กำลังรอสนามยืนยัน',
      };
    case 'already_in_progress':
      return {
        ok: true,
        outcome: result.outcome,
        message: 'มีคำขอจองที่กำลังดำเนินการอยู่แล้ว',
      };
    case 'not_eligible':
      return {
        ok: false,
        outcome: result.outcome,
        message:
          reasonLabel[result.reason] ??
          `ยังจองไม่ได้ ขาดผู้เล่นอีก ${result.missingPlayers} คน และอีก ${result.shortfallThb} บาท`,
      };
    default:
      return {
        ok: false,
        outcome: result.outcome,
        message:
          result.reason === 'no_approved_venue'
            ? reasonLabel.no_approved_venue
            : 'ลองสนามที่อนุมัติไว้ครบทุกแห่งแล้วแต่ไม่สำเร็จ กรุณาเพิ่มสนามสำรองหรือเปลี่ยนเวลา',
      };
  }
}

export type CancelSessionResult =
  { ok: true; refundedPlayers: number; refundedThb: number } | { ok: false; error: string };

/**
 * Cancelling a session refunds every paid player according to the policy that
 * was in force when they paid, then releases the court.
 */
export async function cancelSessionAction(
  sessionId: string,
  reason: string,
): Promise<CancelSessionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const admin = createAdminClient();
  const { data: session } = await admin
    .from('sessions')
    .select('id, organizer_id, status, starts_at, cancellation_policy')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) return { ok: false, error: reasonLabel.session_not_found };
  if (session.organizer_id !== user.id && user.role !== 'platform_admin') {
    return { ok: false, error: reasonLabel.forbidden };
  }

  const { data: cancelData } = await admin.rpc('cancel_session', {
    p_session_id: sessionId,
    p_reason: reason,
    p_actor: user.id,
  });

  const cancelled = cancelData as { ok?: boolean; reason?: string } | null;
  if (!cancelled?.ok) {
    return {
      ok: false,
      error: reasonLabel[cancelled?.reason ?? ''] ?? t.common.unexpectedError,
    };
  }

  const { refundedPlayers, refundedThb } = await refundAllPaidParticipants({
    sessionId,
    reason,
    initiatedBy: user.role === 'platform_admin' ? 'platform' : 'organizer',
    actorId: user.id,
    session,
  });

  revalidatePath('/organizer');
  revalidatePath('/app');
  revalidatePath('/discover');

  return { ok: true, refundedPlayers, refundedThb };
}

/* -------------------------------------------------------------------------
 * Settling the real cost (LSN-0021).
 *
 * Through the organizer's own client, so is_session_organizer() inside the RPC
 * sees the real caller.
 * ---------------------------------------------------------------------- */

export type SettleResult =
  | { ok: true; totalThb: number; perPersonThb: number; unpaidUpdated: number }
  | { ok: false; error: string };

export async function settleSessionAction(
  sessionId: string,
  shuttleCostThb: number,
  splitMode: 'equal' | 'by_games',
): Promise<SettleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('settle_session_costs', {
    p_session_id: sessionId,
    p_shuttle_cost_thb: Math.max(0, Math.round(shuttleCostThb)),
    p_split_mode: splitMode,
  });

  if (error) {
    console.error('[settleSessionAction] settle_session_costs failed', error);
    return { ok: false, error: t.common.unexpectedError };
  }

  const result = data as {
    ok?: boolean;
    reason?: string;
    totalThb?: number;
    perPersonThb?: number;
    unpaidUpdated?: number;
  } | null;

  if (!result?.ok) {
    // session.ts has reasonLabel and t imported already, but no describe()
    // helper the way participation.ts does; inline the same fallback.
    const reason = result?.reason;
    return { ok: false, error: (reason && reasonLabel[reason]) || t.common.unexpectedError };
  }

  revalidatePath('/organizer', 'layout');
  revalidatePath('/s', 'layout');
  return {
    ok: true,
    totalThb: result.totalThb ?? 0,
    perPersonThb: result.perPersonThb ?? 0,
    unpaidUpdated: result.unpaidUpdated ?? 0,
  };
}
