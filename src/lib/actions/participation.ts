'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { getPaymentProvider } from '@/lib/payments';
import { calculateRefund } from '@/lib/domain/refund';
import { parseCancellationPolicy } from '@/lib/domain/types';
import { runBookingOrchestration } from '@/lib/orchestration/book-session';
import { reasonLabel, t } from '@/i18n';

/**
 * Player-facing actions.
 *
 * Each one re-establishes who the caller is on the server, then delegates the
 * state change to a transactional RPC. Nothing here trusts a value that came
 * from the browser beyond an id, and every amount is recomputed server-side.
 */

export type ParticipationResult =
  | { ok: true; outcome: 'joined'; participantId: string; amountDueThb: number }
  | { ok: true; outcome: 'waitlisted'; position: number }
  | { ok: true; outcome: 'already_joined'; participantId: string }
  | { ok: false; error: string };

function describe(reason: string | undefined): string {
  if (!reason) return t.common.unexpectedError;
  return reasonLabel[reason] ?? t.common.unexpectedError;
}

export async function joinSessionAction(sessionId: string): Promise<ParticipationResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  // Called with the user's own client so join_session sees auth.uid() and
  // cannot be pointed at somebody else.
  const { data, error } = await supabase.rpc('join_session', {
    p_session_id: sessionId,
  });

  if (error) {
    console.error('[joinSessionAction] join_session failed', error);
    return { ok: false, error: t.common.unexpectedError };
  }

  const result = data as {
    ok?: boolean;
    outcome?: string;
    reason?: string;
    participantId?: string;
    amountDueThb?: number;
    position?: number;
  } | null;

  if (!result?.ok) return { ok: false, error: describe(result?.reason) };

  revalidatePath(`/s`, 'layout');
  revalidatePath('/app');

  if (result.outcome === 'waitlisted') {
    return { ok: true, outcome: 'waitlisted', position: result.position ?? 0 };
  }
  if (result.outcome === 'already_joined') {
    return {
      ok: true,
      outcome: 'already_joined',
      participantId: result.participantId!,
    };
  }
  return {
    ok: true,
    outcome: 'joined',
    participantId: result.participantId!,
    amountDueThb: result.amountDueThb ?? 0,
  };
}

export type PayResult =
  | {
      ok: true;
      sessionStatus: string;
      booked: boolean;
      bookingOutcome?: string;
    }
  | { ok: false; error: string; retryable: boolean };

/**
 * Take payment for a slot.
 *
 * Order matters: the payment row is created first so there is a durable record
 * before any money moves, then the provider is called, then the result is
 * written back. A crash between steps leaves a `pending` payment that the
 * expiry job cleans up — never a charged player with no record.
 */
export async function payForSlotAction(participantId: string): Promise<PayResult> {
  const user = await getCurrentUser();
  if (!user)
    return {
      ok: false,
      error: reasonLabel.not_authenticated,
      retryable: false,
    };

  const supabase = await createClient();
  const { data: participant } = await supabase
    .from('session_participants')
    .select('id, session_id, user_id, status, amount_due_thb')
    .eq('id', participantId)
    .maybeSingle();

  if (!participant || participant.user_id !== user.id) {
    return { ok: false, error: reasonLabel.forbidden, retryable: false };
  }

  const admin = createAdminClient();
  const provider = getPaymentProvider();

  // A retry after a decline needs a fresh idempotency key, so it is derived
  // from how many payment attempts this participant has already made.
  const { count } = await admin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('participant_id', participantId);

  const idempotencyKey = `pay:${participantId}:${count ?? 0}`;

  type StartedPayment = {
    ok?: boolean;
    reason?: string;
    paymentId?: string;
    status?: string;
    amountThb?: number;
  };

  let started: StartedPayment | null;

  // A pay-later debt already has its payment row, created when the organizer
  // granted the seat. start_payment would refuse it twice over — the status is
  // not `joined_pending_payment` and the deadline has passed by design — so the
  // debt is settled against the existing row rather than opening a second one.
  if (participant.status === 'joined_pay_later' || participant.status === 'payment_overdue') {
    // Returns the live row when there is one, and opens a fresh one when the
    // last attempt was declined. Without the second half, a single declined
    // card would leave the debt permanently unpayable: settle_payment marks the
    // row `failed`, and start_payment refuses a pay-later participant outright.
    const { data: debtData } = await admin.rpc('open_pay_later_payment', {
      p_participant_id: participantId,
      p_idempotency_key: idempotencyKey,
      p_provider: provider.name,
    });
    started = debtData as StartedPayment | null;
  } else {
    const { data: startData } = await admin.rpc('start_payment', {
      p_participant_id: participantId,
      p_idempotency_key: idempotencyKey,
      p_provider: provider.name,
      p_actor: user.id,
    });
    started = startData as StartedPayment | null;
  }

  if (!started?.ok || !started.paymentId) {
    return { ok: false, error: describe(started?.reason), retryable: false };
  }

  if (started.status === 'paid') {
    return { ok: true, sessionStatus: 'unchanged', booked: false };
  }

  const charge = await provider.createCharge({
    amountThb: started.amountThb ?? participant.amount_due_thb,
    currency: 'THB',
    idempotencyKey,
    description: `ค่าสนาม — ${participant.session_id}`,
    metadata: {
      sessionId: participant.session_id,
      participantId,
      userId: user.id,
    },
  });

  if (charge.status === 'pending') {
    // Nothing is confirmed until the provider settles; say exactly that.
    return {
      ok: false,
      error: 'การชำระเงินยังอยู่ระหว่างดำเนินการ กรุณารอสักครู่แล้วตรวจสอบสถานะอีกครั้ง',
      retryable: true,
    };
  }

  const succeeded = charge.status === 'succeeded';

  const { data: settleData } = await admin.rpc('settle_payment', {
    p_payment_id: started.paymentId,
    p_succeeded: succeeded,
    p_provider_ref: charge.status === 'failed' ? undefined : charge.providerRef,
    p_failure: charge.status === 'failed' ? charge.failureCode : undefined,
    p_actor: user.id,
  });

  revalidatePath('/app');
  revalidatePath('/s', 'layout');

  if (!succeeded) {
    return {
      ok: false,
      error: charge.status === 'failed' ? charge.failureMessage : t.common.unexpectedError,
      retryable: true,
    };
  }

  const settled = settleData as { sessionStatus?: string } | null;
  const sessionStatus = settled?.sessionStatus ?? 'open';

  // Journey C: crossing the threshold is what starts the booking workflow.
  if (sessionStatus === 'ready_to_book') {
    const outcome = await runBookingOrchestration(participant.session_id, {
      actorId: user.id,
    });
    revalidatePath('/organizer');
    return {
      ok: true,
      sessionStatus,
      booked: outcome.outcome === 'booked',
      bookingOutcome: outcome.outcome,
    };
  }

  return { ok: true, sessionStatus, booked: false };
}

export type RefundOutcome = 'none' | 'completed' | 'pending' | 'failed';

export type CancelResult =
  | {
      ok: true;
      refundThb: number;
      refundOutcome: RefundOutcome;
      promotedUserId?: string;
    }
  | { ok: false; error: string };

export async function cancelParticipationAction(
  participantId: string,
  reason = 'ผู้เล่นยกเลิกเอง',
): Promise<CancelResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  const { data: participant } = await supabase
    .from('session_participants')
    .select('id, session_id, user_id, status')
    .eq('id', participantId)
    .maybeSingle();

  if (!participant || participant.user_id !== user.id) {
    return { ok: false, error: reasonLabel.forbidden };
  }

  const admin = createAdminClient();

  const { data: session } = await admin
    .from('sessions')
    .select('id, status, starts_at, cancellation_policy, target_players')
    .eq('id', participant.session_id)
    .maybeSingle();

  if (!session) return { ok: false, error: reasonLabel.session_not_found };

  const { data: payment } = await admin
    .from('payments')
    .select('amount_thb')
    .eq('participant_id', participantId)
    .eq('status', 'paid')
    .maybeSingle();

  const policy = parseCancellationPolicy(session.cancellation_policy);
  const refund = calculateRefund({
    policy,
    paidAmountThb: payment?.amount_thb ?? 0,
    sessionStartsAt: session.starts_at,
    sessionStatus: session.status,
    initiatedBy: 'player',
  });

  const { data: cancelData } = await admin.rpc('cancel_participation', {
    p_participant_id: participantId,
    p_refund_thb: refund.refundThb,
    p_reason: reason,
    p_policy_snapshot: {
      ...policy,
      appliedRule: refund.rule,
      percent: refund.percent,
    },
    p_idempotency_key: `cancel:${participantId}`,
    p_actor: user.id,
  });

  const cancelled = cancelData as {
    ok?: boolean;
    reason?: string;
    refundId?: string;
  } | null;
  if (!cancelled?.ok) return { ok: false, error: describe(cancelled?.reason) };

  // The slot is released either way; the refund is reported as whatever it
  // actually did, never as whatever we hoped it would do.
  const refundOutcome: RefundOutcome = cancelled.refundId
    ? await processRefund(cancelled.refundId, user.id)
    : 'none';

  const promotedUserId = await promoteNextWaitlisted(participant.session_id, user.id);

  revalidatePath('/app');
  revalidatePath('/s', 'layout');
  revalidatePath('/organizer');

  return {
    ok: true,
    refundThb: refund.refundThb,
    refundOutcome,
    promotedUserId,
  };
}

/**
 * Runs a created refund through the provider and records the outcome.
 * Returns what actually happened so callers can report it truthfully.
 */
export async function processRefund(refundId: string, actorId?: string): Promise<RefundOutcome> {
  const admin = createAdminClient();
  const provider = getPaymentProvider();

  const { data: refund } = await admin
    .from('refunds')
    .select('id, amount_thb, reason, payment_id, payments(provider_ref)')
    .eq('id', refundId)
    .maybeSingle();

  if (!refund) return 'failed';

  const providerRef = (refund.payments as { provider_ref: string | null } | null)?.provider_ref;

  if (!providerRef) {
    await admin.rpc('settle_refund', {
      p_refund_id: refundId,
      p_succeeded: false,
      p_provider_ref: undefined,
      p_actor: actorId,
    });
    return 'failed';
  }

  const result = await provider.refund({
    providerRef,
    amountThb: refund.amount_thb,
    idempotencyKey: `refund:${refundId}`,
    reason: refund.reason,
  });

  await admin.rpc('settle_refund', {
    p_refund_id: refundId,
    p_succeeded: result.status === 'succeeded',
    p_provider_ref: result.status === 'failed' ? undefined : result.providerRef,
    p_actor: actorId,
  });

  if (result.status === 'succeeded') return 'completed';
  if (result.status === 'pending') return 'pending';

  console.error('[processRefund] provider refused refund', refundId, result);
  return 'failed';
}

/** Gives a freed slot to the next person in the queue. */
async function promoteNextWaitlisted(
  sessionId: string,
  actorId?: string,
): Promise<string | undefined> {
  const admin = createAdminClient();
  const { data } = await admin.rpc('promote_waitlist', {
    p_session_id: sessionId,
    p_window_minutes: 60,
    p_actor: actorId,
  });
  const promoted = data as { ok?: boolean; userId?: string } | null;
  return promoted?.ok ? promoted.userId : undefined;
}

export async function leaveWaitlistAction(
  waitlistEntryId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const admin = createAdminClient();
  const { data: entry } = await admin
    .from('waitlist_entries')
    .select('id, user_id, session_id, status')
    .eq('id', waitlistEntryId)
    .maybeSingle();

  if (!entry || entry.user_id !== user.id) {
    return { ok: false, error: reasonLabel.forbidden };
  }

  await admin.from('waitlist_entries').update({ status: 'cancelled' }).eq('id', waitlistEntryId);
  await admin.rpc('app_log', {
    p_actor: user.id,
    p_entity_type: 'waitlist_entry',
    p_entity_id: waitlistEntryId,
    p_session_id: entry.session_id,
    p_action: 'waitlist.left',
    p_from: entry.status,
    p_to: 'cancelled',
    p_metadata: {},
  });

  revalidatePath('/app');
  revalidatePath('/s', 'layout');
  return { ok: true };
}

/* -------------------------------------------------------------------------
 * Pay later (LSN-0019).
 *
 * Both actions go through the caller's own client, so the RPC's
 * is_session_organizer() check sees the real caller and cannot be pointed at
 * somebody else's session. The server-side check is the boundary; the UI's
 * eligibility check only decides what to offer.
 * ---------------------------------------------------------------------- */

export type PayLaterResult = { ok: true } | { ok: false; error: string };

async function callPayLaterRpc(
  fn: 'grant_pay_later' | 'revoke_pay_later',
  participantId: string,
): Promise<PayLaterResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_participant_id: participantId });

  if (error) {
    console.error(`[${fn}] rpc failed`, error);
    return { ok: false, error: t.common.unexpectedError };
  }

  const result = data as { ok?: boolean; reason?: string } | null;
  if (!result?.ok) return { ok: false, error: describe(result?.reason) };

  revalidatePath('/organizer', 'layout');
  revalidatePath('/s', 'layout');
  return { ok: true };
}

export async function grantPayLaterAction(participantId: string): Promise<PayLaterResult> {
  return callPayLaterRpc('grant_pay_later', participantId);
}

export async function revokePayLaterAction(participantId: string): Promise<PayLaterResult> {
  return callPayLaterRpc('revoke_pay_later', participantId);
}

/**
 * Attendance (LSN-0020). The organizer's own client again, so the RPC's
 * is_session_organizer() check sees the real caller.
 */
export async function setCheckInAction(
  participantId: string,
  present: boolean,
): Promise<PayLaterResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_check_in', {
    p_participant_id: participantId,
    p_present: present,
  });

  if (error) {
    console.error('[setCheckInAction] set_check_in failed', error);
    return { ok: false, error: t.common.unexpectedError };
  }

  const result = data as { ok?: boolean; reason?: string } | null;
  if (!result?.ok) return { ok: false, error: describe(result?.reason) };

  revalidatePath('/organizer', 'layout');
  return { ok: true };
}
