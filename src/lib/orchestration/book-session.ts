import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  selectFallbackCourt,
  type BookingAttempt,
  type VenuePreference,
} from '@/lib/domain/fallback';
import { evaluateBookingEligibility } from '@/lib/domain/booking-eligibility';
import type { BookingStatus } from '@/lib/domain/types';
import { formatDateTime } from '@/lib/format';

/**
 * Automatic booking orchestration.
 *
 * Runs entirely server-side with the service role. Every step that touches a
 * court is a single transactional RPC; this function only decides which court
 * to try next and when to stop. That split is deliberate — the ordering logic
 * is pure and unit-tested in `domain/fallback.ts`, and the race-sensitive part
 * lives in Postgres where locks and constraints can enforce it.
 *
 * The sequence, per the product spec:
 *   1. Re-check availability (inside `try_hold_court`, under a court lock).
 *   2. Create a temporary hold with an expiry.
 *   3. Request the booking, converting the hold.
 *   4. Confirm — immediately for auto-confirm venues, otherwise the venue
 *      answers in the partner inbox.
 *   5. Mark the session booked.
 *   6. Notify the organizer and every paid participant.
 *
 * It is safe to call repeatedly. Idempotency keys are derived from the session,
 * attempt number and court, so a retry re-uses the same hold and booking rather
 * than creating duplicates.
 */

export type OrchestrationResult =
  | {
      outcome: 'booked';
      bookingId: string;
      courtId: string;
      venueId: string;
      priceThb: number;
      attempts: number;
    }
  | {
      outcome: 'awaiting_venue';
      bookingId: string;
      courtId: string;
      venueId: string;
      priceThb: number;
      attempts: number;
    }
  | { outcome: 'not_eligible'; reason: string; missingPlayers: number; shortfallThb: number }
  | { outcome: 'failed'; reason: string; triedCourtIds: string[] }
  | { outcome: 'already_in_progress'; bookingId: string };

const HOLD_MINUTES = 15;
/** Guards against a pathological preference list; the real bound is the list length. */
const MAX_ATTEMPTS = 12;

type AdminClient = ReturnType<typeof createAdminClient>;

function holdKey(sessionId: string, courtId: string, attemptNo: number): string {
  return `hold:${sessionId}:${attemptNo}:${courtId}`;
}

function bookingKey(sessionId: string, courtId: string, attemptNo: number): string {
  return `book:${sessionId}:${attemptNo}:${courtId}`;
}

/** Maps a persisted booking row onto the outcome vocabulary the planner uses. */
function toAttemptOutcome(status: BookingStatus): BookingAttempt['outcome'] | null {
  switch (status) {
    case 'confirmed':
      return 'confirmed';
    case 'rejected':
      return 'rejected';
    case 'expired':
      return 'expired';
    case 'failed':
    case 'cancelled':
      return 'error';
    default:
      // `requested` and `held` are still live, not finished attempts.
      return null;
  }
}

async function cheapestApprovedPrice(
  admin: AdminClient,
  preferences: VenuePreference[],
  startsAt: string,
  endsAt: string,
): Promise<number> {
  const prices = await Promise.all(
    preferences.map(async (preference) => {
      const { data } = await admin.rpc('court_price_for', {
        p_court_id: preference.courtId,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
      });
      return typeof data === 'number' ? data : Number.POSITIVE_INFINITY;
    }),
  );

  const cheapest = Math.min(...prices);
  return Number.isFinite(cheapest) ? cheapest : 0;
}

async function notifySessionAudience(
  admin: AdminClient,
  sessionId: string,
  kind: string,
  title: string,
  body: string,
  actionUrl: string,
): Promise<void> {
  const { data: session } = await admin
    .from('sessions')
    .select('organizer_id')
    .eq('id', sessionId)
    .maybeSingle();

  const { data: participants } = await admin
    .from('session_participants')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('status', 'paid_confirmed');

  const recipients = new Set<string>();
  if (session?.organizer_id) recipients.add(session.organizer_id);
  for (const row of participants ?? []) recipients.add(row.user_id);

  await Promise.all(
    [...recipients].map((userId) =>
      admin.rpc('notify_user', {
        p_user_id: userId,
        p_session_id: sessionId,
        p_kind: kind,
        p_title: title,
        p_body: body,
        p_action_url: actionUrl,
      }),
    ),
  );
}

export async function runBookingOrchestration(
  sessionId: string,
  options: { actorId?: string } = {},
): Promise<OrchestrationResult> {
  const admin = createAdminClient();
  const actor = options.actorId ?? undefined;

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select(
      'id, public_code, title, status, min_players, target_players, starts_at, ends_at, organizer_id',
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return { outcome: 'failed', reason: 'session_not_found', triedCourtIds: [] };
  }

  const { data: preferenceRows } = await admin
    .from('session_venue_preferences')
    .select('id, venue_id, court_id, priority, approved')
    .eq('session_id', sessionId)
    .order('priority', { ascending: true });

  const preferences: VenuePreference[] = (preferenceRows ?? []).map((row) => ({
    id: row.id,
    venueId: row.venue_id,
    courtId: row.court_id,
    priority: row.priority,
    approved: row.approved,
  }));

  const approved = preferences.filter((p) => p.approved);

  const { data: bookingRows } = await admin
    .from('bookings')
    .select('id, court_id, status, attempt_no')
    .eq('session_id', sessionId)
    .order('attempt_no', { ascending: true });

  // A booking already waiting on the venue owns this session; do not start another.
  const live = (bookingRows ?? []).find((b) => b.status === 'requested' || b.status === 'held');
  if (live) {
    return { outcome: 'already_in_progress', bookingId: live.id };
  }

  const attempts: BookingAttempt[] = (bookingRows ?? [])
    .map((row) => {
      const outcome = toAttemptOutcome(row.status);
      return outcome ? { courtId: row.court_id, outcome } : null;
    })
    .filter((a): a is BookingAttempt => a !== null);

  const { data: progress } = await admin.rpc('session_progress', { p_session_id: sessionId });
  const paidParticipants = Number((progress as Record<string, unknown>)?.paidParticipants ?? 0);
  const paidTotalThb = Number((progress as Record<string, unknown>)?.paidTotalThb ?? 0);

  const requiredTotalThb = await cheapestApprovedPrice(
    admin,
    approved,
    session.starts_at,
    session.ends_at,
  );

  const eligibility = evaluateBookingEligibility({
    status: session.status,
    minPlayers: session.min_players,
    targetPlayers: session.target_players,
    paidParticipants,
    paidTotalThb,
    requiredTotalThb,
    startsAt: session.starts_at,
    approvedPreferenceCount: approved.length,
  });

  if (!eligibility.eligible) {
    return {
      outcome: 'not_eligible',
      reason: eligibility.reason,
      missingPlayers: eligibility.missingPlayers,
      shortfallThb: eligibility.shortfallThb,
    };
  }

  // Move into holding_court so the UI reflects that work is underway. A
  // rejection here means another worker got there first.
  const { data: holdingResult } = await admin.rpc('mark_session_holding', {
    p_session_id: sessionId,
    p_actor: actor,
  });
  const holding = holdingResult as { ok?: boolean; reason?: string } | null;
  if (!holding?.ok && holding?.reason !== 'session_not_ready') {
    return {
      outcome: 'failed',
      reason: holding?.reason ?? 'could_not_hold_session',
      triedCourtIds: [],
    };
  }

  const workingAttempts = [...attempts];

  for (let guard = 0; guard < MAX_ATTEMPTS; guard += 1) {
    const selection = selectFallbackCourt(preferences, workingAttempts);

    if (selection.kind === 'already_booked') {
      const confirmed = (bookingRows ?? []).find((b) => b.status === 'confirmed');
      return {
        outcome: 'booked',
        bookingId: confirmed?.id ?? '',
        courtId: selection.preference.courtId,
        venueId: selection.preference.venueId,
        priceThb: 0,
        attempts: workingAttempts.length,
      };
    }

    if (selection.kind === 'exhausted') {
      const reason =
        approved.length === 0 ? 'no_approved_venue' : 'all_approved_options_unavailable';

      await admin.rpc('fail_session_booking', {
        p_session_id: sessionId,
        p_reason: reason,
        p_actor: actor,
      });

      return { outcome: 'failed', reason, triedCourtIds: selection.triedCourtIds };
    }

    const { preference, attemptNo } = selection;

    // Step 2: hold. Re-checks availability under the court lock.
    const { data: holdData } = await admin.rpc('try_hold_court', {
      p_session_id: sessionId,
      p_court_id: preference.courtId,
      p_starts_at: session.starts_at,
      p_ends_at: session.ends_at,
      p_hold_minutes: HOLD_MINUTES,
      p_idempotency_key: holdKey(sessionId, preference.courtId, attemptNo),
      p_actor: actor,
    });

    const hold = holdData as { ok?: boolean; holdId?: string; reason?: string } | null;

    if (!hold?.ok || !hold.holdId) {
      workingAttempts.push({ courtId: preference.courtId, outcome: 'hold_failed' });
      continue;
    }

    // Steps 3–5: convert the hold into a booking.
    const { data: bookingData } = await admin.rpc('request_booking', {
      p_hold_id: hold.holdId,
      p_idempotency_key: bookingKey(sessionId, preference.courtId, attemptNo),
      p_actor: actor,
    });

    const booking = bookingData as {
      ok?: boolean;
      bookingId?: string;
      status?: BookingStatus;
      priceThb?: number;
      reason?: string;
    } | null;

    if (!booking?.ok || !booking.bookingId) {
      await admin.rpc('release_hold', {
        p_hold_id: hold.holdId,
        p_reason: booking?.reason ?? 'booking_request_failed',
        p_actor: actor,
      });
      workingAttempts.push({ courtId: preference.courtId, outcome: 'unavailable' });
      continue;
    }

    const priceThb = booking.priceThb ?? 0;
    const sessionUrl = `/s/${session.public_code}`;

    // Step 6: tell everyone what happened.
    if (booking.status === 'confirmed') {
      await notifySessionAudience(
        admin,
        sessionId,
        'session_booked',
        'ได้สนามแล้ว',
        `${session.title} ยืนยันสนามเรียบร้อย ${formatDateTime(session.starts_at)}`,
        sessionUrl,
      );

      return {
        outcome: 'booked',
        bookingId: booking.bookingId,
        courtId: preference.courtId,
        venueId: preference.venueId,
        priceThb,
        attempts: attemptNo,
      };
    }

    await admin.rpc('notify_user', {
      p_user_id: session.organizer_id,
      p_session_id: sessionId,
      p_kind: 'booking_requested',
      p_title: 'ส่งคำขอจองสนามแล้ว',
      p_body: `กำลังรอสนามยืนยันคำขอจองสำหรับ ${session.title}`,
      p_action_url: `/organizer/sessions/${sessionId}`,
    });

    return {
      outcome: 'awaiting_venue',
      bookingId: booking.bookingId,
      courtId: preference.courtId,
      venueId: preference.venueId,
      priceThb,
      attempts: attemptNo,
    };
  }

  await admin.rpc('fail_session_booking', {
    p_session_id: sessionId,
    p_reason: 'attempt_limit_reached',
    p_actor: actor,
  });

  return {
    outcome: 'failed',
    reason: 'attempt_limit_reached',
    triedCourtIds: workingAttempts.map((a) => a.courtId),
  };
}
