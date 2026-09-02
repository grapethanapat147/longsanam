import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { SessionStatusChip } from '@/components/status';
import { JoinPanel } from '@/components/join-panel';
import { LiveSession } from '@/components/live-updates';
import { ShareLink } from '@/components/share-link';
import { Alert, Card, Chip, Progress } from '@/components/ui/primitives';
import {
  loadApprovedCourtPrices,
  loadMyParticipation,
  loadSessionByCode,
  loadSessionPreferences,
  loadSessionProgress,
} from '@/lib/queries';
import { getCurrentUser } from '@/lib/auth';
import { describePolicy } from '@/lib/domain/refund';
import { costPerPersonThb } from '@/lib/domain/booking-eligibility';
import { formatCountdown, formatDateLong, formatThb, formatTimeRange, sessionShareUrl } from '@/lib/format';
import { sessionStatusHint, t } from '@/i18n';
import { requestNow } from '@/lib/server-time';

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const result = await loadSessionByCode(code);
  if (!result) return { title: 'ไม่พบก๊วน' };
  return {
    title: result.session.title,
    description: `${result.session.area_text} · ${formatDateLong(result.session.starts_at)}`,
  };
}

export default async function SessionDetailPage({ params }: Params) {
  const { code } = await params;
  const result = await loadSessionByCode(code);
  if (!result) notFound();

  const { session, counts, policy } = result;
  const [user, preferences, progress] = await Promise.all([
    getCurrentUser(),
    loadSessionPreferences(session.id),
    loadSessionProgress(session.id),
  ]);

  const mine = user ? await loadMyParticipation(user.id, session.id) : null;
  const approved = preferences.filter((p) => p.approved);
  const isOrganizer = user?.id === session.organizer_id;

  // The real price for this window, so the figure shown to players matches the
  // one the booking workflow will require.
  const { cheapest } = await loadApprovedCourtPrices(
    approved.map((p) => p.court_id),
    session.starts_at,
    session.ends_at,
  );
  const cheapestCourt = cheapest > 0 ? cheapest : null;

  const now = requestNow();
  const participant = mine?.participant ?? null;

  return (
    <AppShell>
      <article className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="neutral">
                {session.sports?.emoji} {session.sports?.name_th}
              </Chip>
              <SessionStatusChip status={session.status} />
              <LiveSession sessionId={session.id} />
            </div>
            <h1 className="mt-2 text-2xl font-bold text-ink-900 dark:text-white">{session.title}</h1>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              {sessionStatusHint[session.status]}
            </p>
          </header>

          {session.status === 'cancelled' && session.cancelled_reason ? (
            <Alert tone="danger" title="ก๊วนนี้ถูกยกเลิก">
              {session.cancelled_reason}
            </Alert>
          ) : null}

          {session.status === 'booking_failed' ? (
            <Alert tone="danger" title="จองสนามไม่สำเร็จ">
              ระบบลองสนามที่อนุมัติไว้ครบทุกแห่งแล้วแต่ไม่ได้คอร์ต ผู้จัดกำลังหาสนามเพิ่ม
              หากยกเลิกก๊วน ผู้เล่นที่ชำระเงินแล้วจะได้รับเงินคืนเต็มจำนวน
            </Alert>
          ) : null}

          <Card className="px-5 py-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="วันที่" value={formatDateLong(session.starts_at)} />
              <Detail label="เวลา" value={formatTimeRange(session.starts_at, session.ends_at)} />
              <Detail
                label="สถานที่"
                value={`${session.area_text}${session.district ? ` · ${session.district}` : ''}`}
              />
              <Detail label={t.session.organizer} value={session.organizer?.display_name ?? '—'} />
              <Detail
                label={t.session.budget}
                value={`${formatThb(session.budget_per_person_thb)} ${t.common.perPerson}`}
              />
              <Detail
                label={t.session.deadline}
                value={`${formatCountdown(session.payment_deadline)}`}
              />
            </dl>

            {session.description ? (
              <p className="mt-4 whitespace-pre-line border-t border-ink-200 pt-4 text-sm text-ink-700 dark:border-white/10 dark:text-ink-200">
                {session.description}
              </p>
            ) : null}
          </Card>

          <Card className="px-5 py-4">
            <h2 className="font-semibold text-ink-900 dark:text-white">{t.session.participants}</h2>
            <div className="mt-3">
              <Progress
                value={counts.paid}
                max={session.target_players}
                label={`${t.session.paidCount} ${counts.paid} / ${t.session.target} ${session.target_players} คน`}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Chip tone="success">ยืนยันแล้ว {counts.paid}</Chip>
              <Chip tone="warning">รอชำระ {counts.pending}</Chip>
              <Chip tone="neutral">
                {t.session.minimum} {session.min_players}
              </Chip>
              {counts.waitlisted > 0 ? (
                <Chip tone="info">
                  {t.session.waitlist} {counts.waitlisted}
                </Chip>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">
              เก็บเงินได้แล้ว {formatThb(progress.paidTotalThb)}
              {cheapestCourt !== null ? (
                <>
                  {' '}
                  · ค่าสนามโดยประมาณ {formatThb(cheapestCourt)} (
                  {formatThb(costPerPersonThb(cheapestCourt, session.min_players))} ต่อคนเมื่อครบขั้นต่ำ)
                </>
              ) : null}
            </p>
          </Card>

          <Card className="px-5 py-4">
            <h2 className="font-semibold text-ink-900 dark:text-white">
              {t.session.venuePreferences}
            </h2>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{t.session.fallbackNote}</p>
            <ol className="mt-3 space-y-2">
              {preferences.map((preference) => (
                <li
                  key={preference.id}
                  className="flex items-center gap-3 rounded-xl border border-ink-200 px-3 py-2 dark:border-white/10"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-bold text-ink-700 dark:bg-white/10 dark:text-ink-200">
                    {preference.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900 dark:text-white">
                      {preference.venues?.name ?? 'สนาม'}
                    </p>
                    <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                      {preference.courts?.name}
                      {preference.venues?.district ? ` · ${preference.venues.district}` : ''}
                    </p>
                  </div>
                  {preference.approved ? (
                    <Chip tone="success">อนุมัติให้จอง</Chip>
                  ) : (
                    <Chip tone="neutral">ไม่อนุมัติ</Chip>
                  )}
                </li>
              ))}
              {preferences.length === 0 ? (
                <li className="text-sm text-ink-500">{t.common.empty}</li>
              ) : null}
            </ol>
          </Card>

          <Card className="px-5 py-4">
            <h2 className="font-semibold text-ink-900 dark:text-white">{t.session.policy}</h2>
            <ul className="mt-2 space-y-1 text-sm text-ink-600 dark:text-ink-300">
              {describePolicy(policy).map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <JoinPanel
            sessionId={session.id}
            publicCode={session.public_code}
            status={session.status}
            slotsLeft={counts.slotsLeft}
            amountThb={session.budget_per_person_thb}
            paymentDeadline={session.payment_deadline}
            startsAt={session.starts_at}
            isSignedIn={Boolean(user)}
            participant={participant}
            waitlistEntry={mine?.waitlistEntry ?? null}
            deadlinePassed={new Date(session.payment_deadline).getTime() <= now}
            sessionStarted={new Date(session.starts_at).getTime() <= now}
            participantPaymentOverdue={
              participant ? new Date(participant.payment_due_at).getTime() <= now : false
            }
          />

          <ShareLink url={sessionShareUrl(session.public_code)} />

          {isOrganizer ? (
            <Card className="px-4 py-3 text-sm">
              <p className="font-medium text-ink-800 dark:text-ink-100">คุณเป็นผู้จัดก๊วนนี้</p>
              <Link
                href={`/organizer/sessions/${session.id}`}
                className="mt-1 inline-block font-semibold text-brand-700 hover:underline dark:text-brand-300"
              >
                ไปหน้าจัดการก๊วน →
              </Link>
            </Card>
          ) : null}
        </aside>
      </article>
    </AppShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-500 dark:text-ink-400">{label}</dt>
      <dd className="text-sm font-medium text-ink-900 dark:text-white">{value}</dd>
    </div>
  );
}
