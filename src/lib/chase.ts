import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { chaseDecision } from '@/lib/domain/credit';
import { pushLineMessage } from '@/lib/line';

/**
 * Post-session payment chasing.
 *
 * Postgres lists who is inside the chase window; `chaseDecision` decides
 * whether today's reminder has already gone out. Keeping the decision in
 * TypeScript means the schedule is stated once, in the file the tests read,
 * rather than buried in a WHERE clause nothing checks.
 *
 * Like the rest of the sweep, this is not a server action: the caller is
 * responsible for authorizing the request first.
 */

export type ChaseResult = { chasedParticipants: number; creditCharged: number };

type ChaseableRow = {
  participant_id: string;
  user_id: string;
  session_id: string;
  session_title: string;
  amount_due_thb: number;
  ends_at: string;
  last_chased_at: string | null;
  line_user_id: string | null;
  checked_in_at: string | null;
};

export async function runPaymentChase(): Promise<ChaseResult> {
  const admin = createAdminClient();
  const result: ChaseResult = { chasedParticipants: 0, creditCharged: 0 };

  const { data, error } = await admin.rpc('list_chaseable_participants');
  if (error) {
    console.error('[chase] list_chaseable_participants failed', error);
    return result;
  }

  const now = new Date();

  for (const row of (data ?? []) as ChaseableRow[]) {
    const decision = chaseDecision({
      endsAt: new Date(row.ends_at),
      lastChasedAt: row.last_chased_at ? new Date(row.last_chased_at) : null,
      now,
    });
    if (!decision.shouldChase) continue;

    // Proof, stated plainly. A reminder that can say "you were there" is a
    // different message from one that can only assert a debt.
    const attended = row.checked_in_at
      ? `คุณเช็คอินเมื่อ ${new Date(row.checked_in_at).toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Bangkok',
        })} · `
      : '';
    const body = `${attended}ก๊วน "${row.session_title}" จบแล้ว ยอดค้างชำระ ฿${row.amount_due_thb}`;

    const { error: chaseError } = await admin.rpc('record_chase', {
      p_participant_id: row.participant_id,
      p_delta: decision.creditDelta,
      p_reason: `overdue_day_${decision.dayIndex}`,
      p_title: 'ยังค้างชำระค่าก๊วน',
      p_body: body,
    });

    if (chaseError) {
      console.error('[chase] record_chase failed', row.participant_id, chaseError);
      continue;
    }

    result.chasedParticipants += 1;
    if (decision.creditDelta !== 0) result.creditCharged += 1;

    // LINE is an extra channel, never a required one. record_chase has already
    // written the in-app notification, so a dead token must not cost us the
    // sweep — pushLineMessage returns a result rather than throwing.
    if (row.line_user_id) {
      const push = await pushLineMessage({ lineUserId: row.line_user_id, text: body });
      if (!push.ok && push.reason === 'request_failed') {
        console.warn('[chase] LINE push failed', row.participant_id, push.detail);
      }
    }
  }

  return result;
}
