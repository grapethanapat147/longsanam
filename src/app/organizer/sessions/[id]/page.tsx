import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import {
  BookingStatusChip,
  ParticipantStatusChip,
  SessionStatusChip,
} from '@/components/status';
import { ShareLink } from '@/components/share-link';
import { OrganizerControls } from '@/components/organizer-controls';
import { SessionTimeline } from '@/components/session-timeline';
import { AvatarImage } from '@/components/image-upload';
import { LiveSession } from '@/components/live-updates';
import { Alert, Card, Chip, PageHeader, Stat } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/auth';
import {
  loadApprovedCourtPrices,
  loadSessionPreferences,
  loadSessionProgress,
  loadSessionTimeline,
} from '@/lib/queries';
import { evaluateBookingEligibility } from '@/lib/domain/booking-eligibility';
import { parseCancellationPolicy } from '@/lib/domain/types';
import { formatCountdown, formatDateLong, formatThb, formatTimeRange, sessionShareUrl } from '@/lib/format';
import { sessionStatusHint, t } from '@/i18n';
import type { BookingStatus, ParticipantStatus, SessionStatus } from '@/lib/domain/types';

export const metadata: Metadata = { title: t.organizer.dashboard };

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> };

export default async function OrganizerSessionPage({ params, searchParams }: Params) {
  const { id } = await params;
  const { created } = await searchParams;
  const user = await requireUser(`/organizer/sessions/${id}`);
  const supabase = await createClient();

  const { data } = await supabase
    .from('sessions')
    .select(
      `id, public_code, title, description, area_text, district, starts_at, ends_at, status,
       budget_per_person_thb, target_players, min_players, payment_deadline, organizer_id,
       cancellation_policy, failure_reason, cancelled_reason, sports (name_th, emoji)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!data) notFound();

  const session = data as unknown as {
    id: string;
    public_code: string;
    title: string;
    description: string | null;
    area_text: string;
    district: string | null;
    starts_at: string;
    ends_at: string;
    status: SessionStatus;
    budget_per_person_thb: number;
    target_players: number;
    min_players: number;
    payment_deadline: string;
    organizer_id: string;
    cancellation_policy: unknown;
    failure_reason: string | null;
    cancelled_reason: string | null;
    sports: { name_th: string; emoji: string } | null;
  };

  const isOwner = session.organizer_id === user.id;
  if (!isOwner && user.role !== 'platform_admin') notFound();

  const admin = createAdminClient();

  const [preferences, progress, timeline, { data: participantRows }, { data: waitlistRows }, { data: bookingRows }] =
    await Promise.all([
      loadSessionPreferences(session.id),
      loadSessionProgress(session.id),
      loadSessionTimeline(session.id),
      admin
        .from('session_participants')
        .select('id, status, amount_due_thb, payment_due_at, joined_at, user_id, profiles (display_name, avatar_url)')
        .eq('session_id', session.id)
        .order('joined_at', { ascending: true }),
      admin
        .from('waitlist_entries')
        .select('id, position, status, user_id, profiles (display_name)')
        .eq('session_id', session.id)
        .in('status', ['waiting', 'promoted'])
        .order('position', { ascending: true }),
      admin
        .from('bookings')
        .select('id, status, price_thb, attempt_no, starts_at, ends_at, decision_reason, venues (name), courts (name)')
        .eq('session_id', session.id)
        .order('attempt_no', { ascending: true }),
    ]);

  const participants = (participantRows ?? []) as unknown as {
    id: string;
    status: ParticipantStatus;
    amount_due_thb: number;
    payment_due_at: string;
    joined_at: string;
    user_id: string;
    profiles: { display_name: string; avatar_url: string | null } | null;
  }[];

  const waitlist = (waitlistRows ?? []) as unknown as {
    id: string;
    position: number;
    status: string;
    profiles: { display_name: string } | null;
  }[];

  const bookings = (bookingRows ?? []) as unknown as {
    id: string;
    status: BookingStatus;
    price_thb: number;
    attempt_no: number;
    starts_at: string;
    ends_at: string;
    decision_reason: string | null;
    venues: { name: string } | null;
    courts: { name: string } | null;
  }[];

  const approved = preferences.filter((p) => p.approved);

  // The price for this session's actual window, including peak and weekend
  // rules — the same figure the orchestrator gates the booking on.
  const { byCourt: courtPrices, cheapest: requiredTotalThb } = await loadApprovedCourtPrices(
    approved.map((p) => p.court_id),
    session.starts_at,
    session.ends_at,
  );

  const eligibility = evaluateBookingEligibility({
    status: session.status,
    minPlayers: session.min_players,
    targetPlayers: session.target_players,
    paidParticipants: progress.paidParticipants,
    paidTotalThb: progress.paidTotalThb,
    requiredTotalThb,
    startsAt: session.starts_at,
    approvedPreferenceCount: approved.length,
  });

  const policy = parseCancellationPolicy(session.cancellation_policy);
  const pendingThb = participants
    .filter((p) => p.status === 'joined_pending_payment')
    .reduce((sum, p) => sum + p.amount_due_thb, 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow={session.sports?.name_th}
        title={session.title}
        description={`${formatDateLong(session.starts_at)} · ${formatTimeRange(session.starts_at, session.ends_at)} · ${session.area_text}`}
        action={
          <div className="flex items-center gap-3">
            <LiveSession sessionId={session.id} />
            <SessionStatusChip status={session.status} />
          </div>
        }
      />

      {created ? (
        <div className="mb-4">
          <Alert tone="success" title="สร้างก๊วนเป็นฉบับร่างแล้ว">
            ตรวจสอบรายละเอียดให้เรียบร้อย แล้วกดเผยแพร่เพื่อรับลิงก์สำหรับแชร์
          </Alert>
        </div>
      ) : null}

      {session.status === 'booking_failed' ? (
        <div className="mb-4">
          <Alert tone="danger" title="จองสนามไม่สำเร็จ">
            {session.failure_reason === 'no_approved_venue'
              ? 'ยังไม่มีสนามที่อนุมัติให้จอง กรุณาอนุมัติสนามสำรองด้านล่างแล้วสั่งจองอีกครั้ง'
              : 'ระบบลองสนามที่อนุมัติไว้ครบทุกแห่งแล้ว ลองเพิ่มสนามสำรอง เปลี่ยนเวลา หรือยกเลิกก๊วนเพื่อคืนเงินผู้เล่น'}
          </Alert>
        </div>
      ) : null}

      {session.status === 'cancelled' && session.cancelled_reason ? (
        <div className="mb-4">
          <Alert tone="danger" title="ก๊วนนี้ถูกยกเลิกแล้ว">
            {session.cancelled_reason}
          </Alert>
        </div>
      ) : null}

      <p className="mb-4 text-sm text-ink-600 dark:text-ink-300">
        {sessionStatusHint[session.status]}
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t.organizer.collected}
          value={formatThb(progress.paidTotalThb)}
          hint={`${progress.paidParticipants} คน`}
          tone="positive"
        />
        <Stat
          label={t.organizer.pending}
          value={formatThb(pendingThb)}
          hint={`${progress.pendingParticipants} คน`}
          tone={pendingThb > 0 ? 'negative' : 'default'}
        />
        <Stat
          label={t.organizer.courtCost}
          value={requiredTotalThb > 0 ? formatThb(requiredTotalThb) : '—'}
          hint={
            approved.length > 0
              ? 'สนามที่ถูกที่สุดที่อนุมัติ (รวมค่าช่วงเวลาแล้ว)'
              : 'ยังไม่ได้อนุมัติสนาม'
          }
        />
        <Stat
          label={t.organizer.refunded}
          value={formatThb(progress.refundedTotalThb)}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <OrganizerControls
            sessionId={session.id}
            status={session.status}
            eligibility={eligibility}
            preferences={preferences.map((p) => ({
              id: p.id,
              priority: p.priority,
              approved: p.approved,
              venueName: p.venues?.name ?? 'สนาม',
              courtName: p.courts?.name ?? 'คอร์ต',
              district: p.venues?.district ?? '',
              priceThb: courtPrices.get(p.court_id) ?? 0,
            }))}
            policy={policy}
            startsAt={session.starts_at}
            paidParticipants={progress.paidParticipants}
            paidTotalThb={progress.paidTotalThb}
          />

          <Card className="px-5 py-4">
            <h2 className="font-semibold text-ink-900 dark:text-white">
              {t.session.participants} ({participants.length})
            </h2>
            {participants.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">{t.common.empty}</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink-200 dark:divide-white/10">
                {participants.map((participant) => (
                  <li key={participant.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AvatarImage
                        url={participant.profiles?.avatar_url ?? null}
                        displayName={participant.profiles?.display_name ?? 'ผู้เล่น'}
                        size={32}
                      />
                      <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900 dark:text-white">
                        {participant.profiles?.display_name ?? 'ผู้เล่น'}
                      </p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        {formatThb(participant.amount_due_thb)}
                        {participant.status === 'joined_pending_payment'
                          ? ` · ต้องชำระภายใน ${formatCountdown(participant.payment_due_at)}`
                          : ''}
                      </p>
                      </div>
                    </div>
                    <ParticipantStatusChip status={participant.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {waitlist.length > 0 ? (
            <Card className="px-5 py-4">
              <h2 className="font-semibold text-ink-900 dark:text-white">
                {t.session.waitlist} ({waitlist.length})
              </h2>
              <ol className="mt-3 space-y-1">
                {waitlist.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 text-sm text-ink-700 dark:text-ink-200"
                  >
                    <span>
                      <Chip tone="neutral">{entry.position}</Chip>{' '}
                      {entry.profiles?.display_name ?? 'ผู้เล่น'}
                    </span>
                    <span className="text-xs text-ink-500">{entry.status}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          <Card className="px-5 py-4">
            <h2 className="font-semibold text-ink-900 dark:text-white">ความพยายามจองสนาม</h2>
            {bookings.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">
                ยังไม่มีการจอง ระบบจะเริ่มจองอัตโนมัติเมื่อผู้เล่นชำระเงินครบตามขั้นต่ำ
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {bookings.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 px-3 py-2 dark:border-white/10"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900 dark:text-white">
                        ครั้งที่ {booking.attempt_no} · {booking.venues?.name} · {booking.courts?.name}
                      </p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        {formatThb(booking.price_thb)}
                        {booking.decision_reason ? ` · ${booking.decision_reason}` : ''}
                      </p>
                    </div>
                    <BookingStatusChip status={booking.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="px-5 py-4">
            <h2 className="font-semibold text-ink-900 dark:text-white">{t.session.timeline}</h2>
            <SessionTimeline entries={timeline} />
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <ShareLink url={sessionShareUrl(session.public_code)} />
          <Card className="px-4 py-3 text-sm">
            <Link
              href={`/s/${session.public_code}`}
              className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              ดูหน้าก๊วนแบบที่ผู้เล่นเห็น →
            </Link>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
