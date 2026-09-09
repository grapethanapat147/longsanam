import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { processRefund } from '@/lib/actions/participation';
import { calculateRefund } from '@/lib/domain/refund';
import { parseCancellationPolicy, type SessionStatus } from '@/lib/domain/types';

/**
 * Shared refund fan-out for a cancelled session.
 *
 * Deliberately NOT in a `'use server'` module: every export of such a file
 * becomes a callable server action, and this function refunds an entire
 * session. It performs no authorization of its own, so its callers — the
 * organizer's cancel action and the unattended lifecycle sweep — must do that
 * before calling it.
 */

type RefundAllInput = {
  sessionId: string;
  reason: string;
  initiatedBy: 'organizer' | 'platform';
  /** Null when the sweep runs unattended. */
  actorId: string | null;
  session: {
    status: SessionStatus;
    starts_at: string;
    cancellation_policy: unknown;
  };
};

export async function refundAllPaidParticipants(
  input: RefundAllInput,
): Promise<{ refundedPlayers: number; refundedThb: number }> {
  const admin = createAdminClient();

  // Guests are excluded at the query, not skipped in the loop, because there is
  // no path here that could serve them: refunds.user_id and notifications.user_id
  // are both NOT NULL, so cancel_participation and notify_user would each raise
  // on a guest row. Their cash never entered the platform — the organizer took
  // it by hand and has to give it back by hand. The cancel dialog says so.
  const { data: paidParticipants } = await admin
    .from('session_participants')
    .select('id, user_id, payments(id, amount_thb, status)')
    .eq('session_id', input.sessionId)
    .eq('status', 'paid_confirmed')
    .not('user_id', 'is', null);

  const policy = parseCancellationPolicy(input.session.cancellation_policy);
  let refundedPlayers = 0;
  let refundedThb = 0;

  for (const participant of paidParticipants ?? []) {
    const payments = (participant.payments ?? []) as {
      amount_thb: number;
      status: string;
    }[];
    const paid = payments.find((p) => p.status === 'paid');

    const refund = calculateRefund({
      policy,
      paidAmountThb: paid?.amount_thb ?? 0,
      sessionStartsAt: input.session.starts_at,
      sessionStatus: input.session.status,
      initiatedBy: input.initiatedBy,
    });

    // Keyed on session + participant, so re-running a sweep cannot double-refund.
    const { data } = await admin.rpc('cancel_participation', {
      p_participant_id: participant.id,
      p_refund_thb: refund.refundThb,
      p_reason: input.reason,
      p_policy_snapshot: {
        ...policy,
        appliedRule: refund.rule,
        percent: refund.percent,
      },
      p_idempotency_key: `session-cancel:${input.sessionId}:${participant.id}`,
      p_actor: input.actorId ?? undefined,
    });

    const result = data as {
      ok?: boolean;
      refundId?: string;
      refundThb?: number;
    } | null;
    if (result?.refundId) {
      const outcome = await processRefund(result.refundId, input.actorId ?? undefined);
      if (outcome === 'completed' || outcome === 'pending') {
        refundedPlayers += 1;
        refundedThb += result.refundThb ?? 0;
      }
    }

    await admin.rpc('notify_user', {
      p_user_id: participant.user_id as string,
      p_session_id: input.sessionId,
      p_kind: 'session_cancelled',
      p_title: 'ก๊วนถูกยกเลิก',
      p_body: `ก๊วนนี้ถูกยกเลิก: ${input.reason}`,
      p_action_url: '/app/payments',
    });
  }

  return { refundedPlayers, refundedThb };
}
