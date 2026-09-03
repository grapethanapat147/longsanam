import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { refundAllPaidParticipants } from '@/lib/refunds';

/**
 * The unattended maintenance pass.
 *
 * Everything here is idempotent and safe to run on a short interval: each
 * routine selects only rows that are genuinely overdue, and the refund fan-out
 * is keyed so a repeat run cannot pay twice.
 *
 * Like `refundAllPaidParticipants`, this is not a server action — callers are
 * responsible for authorizing the request first (a shared secret for the cron
 * route, a platform-admin check for the admin button).
 */

export type SweepResult = {
  expiredHolds: number;
  expiredBookings: number;
  expiredPayments: number;
  expiredPromotions: number;
  completedSessions: number;
  strandedSessions: number;
  refundedPlayers: number;
  refundedThb: number;
};

const STRANDED_REASON =
  'ระบบไม่สามารถจองสนามได้ทันเวลาเริ่มก๊วน จึงยกเลิกและคืนเงินให้ผู้เล่นทุกคนเต็มจำนวน';

export async function runLifecycleSweeps(): Promise<SweepResult> {
  const admin = createAdminClient();

  const [holds, payments, promotions, completed] = await Promise.all([
    admin.rpc('expire_stale_holds'),
    admin.rpc('expire_overdue_payments'),
    admin.rpc('expire_waitlist_promotions'),
    admin.rpc('complete_finished_sessions'),
  ]);

  const h = holds.data as {
    expiredHolds?: number;
    expiredBookings?: number;
  } | null;
  const p = payments.data as { expiredPayments?: number } | null;
  const w = promotions.data as { expiredPromotions?: number } | null;
  const c = completed.data as { completedSessions?: number } | null;

  const result: SweepResult = {
    expiredHolds: h?.expiredHolds ?? 0,
    expiredBookings: h?.expiredBookings ?? 0,
    expiredPayments: p?.expiredPayments ?? 0,
    expiredPromotions: w?.expiredPromotions ?? 0,
    completedSessions: c?.completedSessions ?? 0,
    strandedSessions: 0,
    refundedPlayers: 0,
    refundedThb: 0,
  };

  // A session whose start time passed without a confirmed court can never
  // happen. Leaving it open would strand the players' money, so it is
  // cancelled and everyone who paid is made whole — the same outcome the
  // cancellation policy already promises when the platform cannot deliver.
  const { data: stranded } = await admin.rpc('list_stranded_sessions');

  for (const row of (stranded ?? []) as { id: string }[]) {
    const { data: session } = await admin
      .from('sessions')
      .select('id, status, starts_at, cancellation_policy')
      .eq('id', row.id)
      .maybeSingle();

    if (!session) continue;

    const { data: cancelData } = await admin.rpc('cancel_session', {
      p_session_id: row.id,
      p_reason: STRANDED_REASON,
      p_actor: undefined,
    });

    const cancelled = cancelData as { ok?: boolean } | null;
    if (!cancelled?.ok) continue;

    result.strandedSessions += 1;

    // Reported as `booking_failed` regardless of the status it was sitting in,
    // because that is what actually happened: the session reached its start
    // time with no court. calculateRefund returns the full amount for that
    // case unconditionally — the time-based tiers must not apply here, or an
    // organizer who turned off `organizerCancelAlwaysFullRefund` would leave
    // players out of pocket for a failure that was never theirs.
    const refunds = await refundAllPaidParticipants({
      sessionId: row.id,
      reason: STRANDED_REASON,
      initiatedBy: 'platform',
      actorId: null,
      session: {
        status: 'booking_failed',
        starts_at: session.starts_at,
        cancellation_policy: session.cancellation_policy,
      },
    });

    result.refundedPlayers += refunds.refundedPlayers;
    result.refundedThb += refunds.refundedThb;
  }

  return result;
}
