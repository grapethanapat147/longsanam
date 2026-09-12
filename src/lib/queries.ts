import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCancellationPolicy, type SessionStatus } from '@/lib/domain/types';
import { remainingSlots } from '@/lib/domain/booking-eligibility';
import {
  canSeeReceiptNames,
  isReceiptOrganizer,
} from '@/lib/domain/receipt-visibility';

/**
 * Shared reads.
 *
 * These run through the RLS-scoped client, so a page cannot accidentally show
 * a viewer something the database would not hand them directly.
 */

export const SESSION_CARD_SELECT = `
  id, public_code, title, area_text, district, starts_at, ends_at,
  budget_per_person_thb, target_players, min_players, payment_deadline, status,
  sports (slug, name_th, emoji),
  organizer:profiles!sessions_organizer_id_fkey (id, display_name, avatar_url)
`;

export type SessionCard = {
  id: string;
  public_code: string;
  title: string;
  area_text: string;
  district: string | null;
  starts_at: string;
  ends_at: string;
  budget_per_person_thb: number;
  target_players: number;
  min_players: number;
  payment_deadline: string;
  status: SessionStatus;
  sports: { slug: string; name_th: string; emoji: string } | null;
  organizer: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
};

export type SessionCounts = {
  paid: number;
  pending: number;
  waitlisted: number;
  slotsLeft: number;
};

/** Roster counts for a batch of sessions, in one round trip rather than N. */
export async function loadSessionCounts(sessionIds: string[]): Promise<Map<string, SessionCounts>> {
  const counts = new Map<string, SessionCounts>();
  if (sessionIds.length === 0) return counts;

  const admin = createAdminClient();

  const [{ data: participants }, { data: waitlist }, { data: sessions }] = await Promise.all([
    admin.from('session_participants').select('session_id, status').in('session_id', sessionIds),
    admin
      .from('waitlist_entries')
      .select('session_id, status')
      .in('session_id', sessionIds)
      .eq('status', 'waiting'),
    admin.from('sessions').select('id, target_players').in('id', sessionIds),
  ]);

  const targets = new Map((sessions ?? []).map((s) => [s.id, s.target_players]));

  for (const id of sessionIds) {
    counts.set(id, {
      paid: 0,
      pending: 0,
      waitlisted: 0,
      slotsLeft: targets.get(id) ?? 0,
    });
  }

  for (const row of participants ?? []) {
    const entry = counts.get(row.session_id);
    if (!entry) continue;
    if (row.status === 'paid_confirmed') entry.paid += 1;
    else if (row.status === 'joined_pending_payment') entry.pending += 1;
  }

  for (const row of waitlist ?? []) {
    const entry = counts.get(row.session_id);
    if (entry) entry.waitlisted += 1;
  }

  for (const [id, entry] of counts) {
    entry.slotsLeft = remainingSlots(targets.get(id) ?? 0, entry.paid + entry.pending);
  }

  return counts;
}

export type DiscoverFilters = {
  sport?: string;
  from?: string;
};

export async function loadDiscoverSessions(filters: DiscoverFilters = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('sessions')
    .select(SESSION_CARD_SELECT)
    .in('status', ['open', 'ready_to_book', 'holding_court', 'booked'])
    .gte('starts_at', filters.from ?? new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(50);

  if (filters.sport) {
    const { data: sport } = await supabase
      .from('sports')
      .select('id')
      .eq('slug', filters.sport)
      .maybeSingle();
    if (sport) query = query.eq('sport_id', sport.id);
  }

  const { data } = await query;
  const sessions = (data ?? []) as unknown as SessionCard[];
  const counts = await loadSessionCounts(sessions.map((s) => s.id));

  return { sessions, counts };
}

export async function loadSessionByCode(code: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('sessions')
    .select(
      `${SESSION_CARD_SELECT}, description, cancellation_policy, booking_id, failure_reason,
       cancelled_reason, organizer_id`,
    )
    .eq('public_code', code.toUpperCase())
    .maybeSingle();

  if (!data) return null;

  const session = data as unknown as SessionCard & {
    description: string | null;
    cancellation_policy: unknown;
    booking_id: string | null;
    failure_reason: string | null;
    cancelled_reason: string | null;
    organizer_id: string;
  };

  const counts = (await loadSessionCounts([session.id])).get(session.id)!;

  return {
    session,
    counts,
    policy: parseCancellationPolicy(session.cancellation_policy),
  };
}

/** Ranked venue options for a session, with court and venue names attached. */
export async function loadSessionPreferences(sessionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('session_venue_preferences')
    .select(
      'id, priority, approved, venue_id, court_id, venues (name, district), courts (name, base_price_thb)',
    )
    .eq('session_id', sessionId)
    .order('priority', { ascending: true });

  return (data ?? []) as unknown as {
    id: string;
    priority: number;
    approved: boolean;
    venue_id: string;
    court_id: string;
    venues: { name: string; district: string } | null;
    courts: { name: string; base_price_thb: number } | null;
  }[];
}

export async function loadMyParticipation(userId: string, sessionId: string) {
  const supabase = await createClient();

  const [{ data: participant }, { data: waitlistEntry }] = await Promise.all([
    supabase
      .from('session_participants')
      .select('id, status, amount_due_thb, payment_due_at')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('waitlist_entries')
      .select('id, position, status, promotion_expires_at')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  return { participant, waitlistEntry };
}

export async function loadSessionTimeline(sessionId: string, limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('audit_logs')
    .select('id, action, from_state, to_state, metadata, created_at, actor_id')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}

export async function loadSessionProgress(sessionId: string) {
  const admin = createAdminClient();
  const { data } = await admin.rpc('session_progress', {
    p_session_id: sessionId,
  });
  const progress = (data ?? {}) as Record<string, unknown>;

  return {
    paidParticipants: Number(progress.paidParticipants ?? 0),
    pendingParticipants: Number(progress.pendingParticipants ?? 0),
    paidTotalThb: Number(progress.paidTotalThb ?? 0),
    refundedTotalThb: Number(progress.refundedTotalThb ?? 0),
  };
}

export async function loadSports() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('sports')
    .select('id, slug, name_th, emoji, default_players')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return data ?? [];
}

/**
 * The real court price for a session's exact time window.
 *
 * `courts.base_price_thb` is an hourly rate before peak and weekend rules, so
 * showing it as "the court cost" understates what the session actually needs.
 * This asks the database the same question the orchestrator asks, so the
 * organizer sees the number that will actually gate their booking.
 */
export async function loadApprovedCourtPrices(
  courtIds: string[],
  startsAt: string,
  endsAt: string,
): Promise<{ byCourt: Map<string, number>; cheapest: number }> {
  const byCourt = new Map<string, number>();
  if (courtIds.length === 0) return { byCourt, cheapest: 0 };

  const admin = createAdminClient();
  const prices = await Promise.all(
    courtIds.map(async (courtId) => {
      const { data } = await admin.rpc('court_price_for', {
        p_court_id: courtId,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
      });
      return [courtId, typeof data === 'number' ? data : 0] as const;
    }),
  );

  for (const [courtId, price] of prices) byCourt.set(courtId, price);

  const values = prices.map(([, price]) => price).filter((price) => price > 0);
  return { byCourt, cheapest: values.length > 0 ? Math.min(...values) : 0 };
}

/**
 * ใบสรุปก๊วน (LSN-0023).
 *
 * Two views, one call. `names` is null for anyone outside the session — not an
 * empty array, and not a list the page is trusted to mask. The masked branch
 * never loads names at all, so there is no field a later edit could forget to
 * strip. The totals come from `session_receipt_public()`, which returns counts
 * and nothing else even when called with service-role credentials.
 */
export type ReceiptCharge = { id: string; label: string; amountThb: number };

export type ReceiptTotals = {
  players: number;
  paid: number;
  owing: number;
  perHeadThb: number;
  totalThb: number;
  title: string;
  startsAt: string;
};

export type ReceiptName = {
  participantId: string;
  displayName: string;
  isGuest: boolean;
  paid: boolean;
  amountThb: number;
  paidCash: boolean;
};

export async function loadSessionReceipt(code: string, viewerId: string | null) {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from('sessions')
    .select('id, public_code, title, starts_at, ends_at, status, organizer_id')
    .eq('public_code', code.toUpperCase())
    .maybeSingle();
  if (!row) return null;

  const session = row as unknown as {
    id: string;
    public_code: string;
    title: string;
    starts_at: string;
    ends_at: string;
    status: string;
    organizer_id: string;
  };

  const admin = createAdminClient();
  // The RPC repeats the completed check, so this is a cheap early exit rather
  // than the rule itself. The database stays the one that decides.
  const { data: totalsRaw } = await admin.rpc('session_receipt_public', {
    p_session_id: session.id,
  });
  if (!totalsRaw) return null;
  const totals = totalsRaw as unknown as ReceiptTotals;

  // LSN-0024 fills this in. The page renders the section only when it is
  // non-empty, so shipping the empty array now costs nothing and saves the
  // receipt from being restructured when extra charges land.
  const charges: ReceiptCharge[] = [];

  const isOrganizer = isReceiptOrganizer(viewerId, session.organizer_id);
  let isParticipant = false;
  if (viewerId && !isOrganizer) {
    const { count } = await admin
      .from('session_participants')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)
      .eq('user_id', viewerId);
    isParticipant = (count ?? 0) > 0;
  }

  // Everything below this line reads through the admin client, which ignores
  // RLS. canSeeReceiptNames is therefore the whole boundary, and it is pinned
  // in tests/receipt-visibility.test.ts rather than trusted here.
  if (!canSeeReceiptNames({ viewerId, organizerId: session.organizer_id, isParticipant })) {
    return { session, totals, charges, names: null };
  }

  const { data: rows } = await admin
    .from('session_participants')
    .select(
      'id, status, amount_due_thb, guest_name, ' +
        'profiles!session_participants_user_id_fkey (display_name), ' +
        'payments (status, provider)',
    )
    .eq('session_id', session.id)
    .in('status', ['paid_confirmed', 'joined_pay_later', 'payment_overdue']);

  const names: ReceiptName[] = (rows ?? []).map((r) => {
    const p = r as unknown as {
      id: string;
      status: string;
      amount_due_thb: number;
      guest_name: string | null;
      profiles: { display_name: string } | null;
      payments: { status: string; provider: string }[] | null;
    };
    return {
      participantId: p.id,
      displayName: p.guest_name ?? p.profiles?.display_name ?? 'ผู้เล่น',
      isGuest: p.guest_name !== null,
      paid: p.status === 'paid_confirmed',
      amountThb: p.amount_due_thb,
      paidCash: (p.payments ?? []).some((x) => x.status === 'paid' && x.provider === 'cash'),
    };
  });

  return { session, totals, charges, names };
}
