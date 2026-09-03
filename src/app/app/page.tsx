import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { SessionStatusChip, ParticipantStatusChip, WaitlistStatusChip } from '@/components/status';
import { Alert, ButtonLink, Card, Chip, EmptyState, PageHeader } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { formatCountdown, formatDate, formatThb, formatTimeRange } from '@/lib/format';
import { requestNow } from '@/lib/server-time';
import { t } from '@/i18n';
import type { ParticipantStatus, SessionStatus, WaitlistStatus } from '@/lib/domain/types';

export const metadata: Metadata = { title: t.nav.mySessions };

type ParticipantRow = {
  id: string;
  status: ParticipantStatus;
  amount_due_thb: number;
  payment_due_at: string;
  sessions: {
    id: string;
    public_code: string;
    title: string;
    starts_at: string;
    ends_at: string;
    area_text: string;
    status: SessionStatus;
    sports: { name_th: string; emoji: string } | null;
  } | null;
};

type WaitlistRow = {
  id: string;
  position: number;
  status: WaitlistStatus;
  promotion_expires_at: string | null;
  sessions: {
    public_code: string;
    title: string;
    starts_at: string;
    status: SessionStatus;
  } | null;
};

export default async function MySessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser('/app');
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: participations }, { data: waitlists }] = await Promise.all([
    supabase
      .from('session_participants')
      .select(
        `id, status, amount_due_thb, payment_due_at,
         sessions (id, public_code, title, starts_at, ends_at, area_text, status,
                   sports (name_th, emoji))`,
      )
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false }),
    supabase
      .from('waitlist_entries')
      .select(
        'id, position, status, promotion_expires_at, sessions (public_code, title, starts_at, status)',
      )
      .eq('user_id', user.id)
      .in('status', ['waiting', 'promoted'])
      .order('position', { ascending: true }),
  ]);

  const rows = (participations ?? []) as unknown as ParticipantRow[];
  const queue = (waitlists ?? []) as unknown as WaitlistRow[];

  const now = requestNow();
  const upcoming = rows.filter((r) => r.sessions && new Date(r.sessions.starts_at).getTime() > now);
  const past = rows.filter((r) => r.sessions && new Date(r.sessions.starts_at).getTime() <= now);
  const needsPayment = upcoming.filter((r) => r.status === 'joined_pending_payment');

  return (
    <AppShell>
      <PageHeader
        title={t.nav.mySessions}
        description={`สวัสดี ${user.displayName}`}
        action={<ButtonLink href="/discover">{t.nav.discover}</ButtonLink>}
      />

      {error === 'forbidden' ? (
        <div className="mb-4">
          <Alert tone="danger">คุณไม่มีสิทธิ์เข้าถึงหน้านั้น</Alert>
        </div>
      ) : null}

      {needsPayment.length > 0 ? (
        <div className="mb-5">
          <Alert tone="warning" title={`มี ${needsPayment.length} ก๊วนที่รอการชำระเงิน`}>
            ที่นั่งจะยังไม่ถูกยืนยันจนกว่าจะชำระเงิน และจะถูกปล่อยเมื่อหมดเวลา
          </Alert>
        </div>
      ) : null}

      {queue.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold text-ink-900">{t.session.waitlist}</h2>
          <div className="space-y-2">
            {queue.map((entry) =>
              entry.sessions ? (
                <Card key={entry.id} className="px-4 py-3">
                  <Link
                    href={`/s/${entry.sessions.public_code}/waitlist`}
                    className="flex items-center justify-between gap-3 focus-ring rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-900">{entry.sessions.title}</p>
                      <p className="text-xs text-ink-500">
                        {formatDate(entry.sessions.starts_at)} · {t.waitlistPage.position}{' '}
                        {entry.position}
                        {entry.status === 'promoted' && entry.promotion_expires_at
                          ? ` · ชำระภายใน ${formatCountdown(entry.promotion_expires_at)}`
                          : ''}
                      </p>
                    </div>
                    <WaitlistStatusChip status={entry.status} />
                  </Link>
                </Card>
              ) : null,
            )}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">ก๊วนที่กำลังจะถึง</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon="🏸"
            title="ยังไม่มีก๊วนที่กำลังจะถึง"
            description="ลองหาก๊วนที่เปิดรับอยู่ หรือสร้างก๊วนของคุณเอง"
            action={<ButtonLink href="/discover">{t.nav.discover}</ButtonLink>}
          />
        ) : (
          <div className="space-y-2">
            {upcoming.map((row) => (
              <ParticipationRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold text-ink-900">ก๊วนที่ผ่านมา</h2>
          <div className="space-y-2">
            {past.map((row) => (
              <ParticipationRow key={row.id} row={row} muted />
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function ParticipationRow({ row, muted }: { row: ParticipantRow; muted?: boolean }) {
  const session = row.sessions;
  if (!session) return null;

  const needsPayment = row.status === 'joined_pending_payment';

  return (
    <Card className={muted ? 'opacity-70' : undefined}>
      <Link
        href={needsPayment ? `/s/${session.public_code}/join` : `/s/${session.public_code}`}
        className="block rounded-card px-4 py-3 focus-ring"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">
              <span aria-hidden>{session.sports?.emoji} </span>
              {session.title}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              {formatDate(session.starts_at)} ·{' '}
              {formatTimeRange(session.starts_at, session.ends_at)} · {session.area_text}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <ParticipantStatusChip status={row.status} />
            <SessionStatusChip status={session.status} />
          </div>
        </div>

        {needsPayment ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Chip tone="warning">
              ต้องชำระ {formatThb(row.amount_due_thb)} · {formatCountdown(row.payment_due_at)}
            </Chip>
          </p>
        ) : null}
      </Link>
    </Card>
  );
}
