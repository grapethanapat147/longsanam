import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { JoinPanel } from '@/components/join-panel';
import { WaitlistStatusChip } from '@/components/status';
import { Card, EmptyState, PageHeader, ButtonLink } from '@/components/ui/primitives';
import { loadMyParticipation, loadSessionByCode } from '@/lib/queries';
import { requireUser } from '@/lib/auth';
import { formatCountdown, formatDateLong, formatTimeRange } from '@/lib/format';
import { t } from '@/i18n';
import { requestNow } from '@/lib/server-time';

export const metadata: Metadata = { title: t.waitlistPage.title };

export default async function WaitlistPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await loadSessionByCode(code);
  if (!result) notFound();

  const user = await requireUser(`/s/${code}/waitlist`);
  const { session, counts } = result;
  const { participant, waitlistEntry } = await loadMyParticipation(user.id, session.id);
  const now = requestNow();

  if (!waitlistEntry) {
    return (
      <AppShell>
        <EmptyState
          icon="📋"
          title="คุณยังไม่ได้อยู่ในคิวสำรองของก๊วนนี้"
          description="ถ้าก๊วนเต็ม คุณสามารถเข้าคิวสำรองได้จากหน้ารายละเอียดก๊วน"
          action={<ButtonLink href={`/s/${code}`}>ไปหน้าก๊วน</ButtonLink>}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={session.sports?.name_th}
        title={t.waitlistPage.title}
        description={session.title}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card className="px-5 py-6 text-center">
            <p className="text-sm text-ink-500 dark:text-ink-400">{t.waitlistPage.position}</p>
            <p className="mt-1 text-5xl font-black text-brand-600">{waitlistEntry.position}</p>
            <div className="mt-3 flex justify-center">
              <WaitlistStatusChip status={waitlistEntry.status} />
            </div>
            {waitlistEntry.status === 'promoted' && waitlistEntry.promotion_expires_at ? (
              <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                คุณได้สิทธิ์แล้ว กรุณาชำระเงินภายใน{' '}
                {formatCountdown(waitlistEntry.promotion_expires_at)}
              </p>
            ) : (
              <p className="mx-auto mt-3 max-w-sm text-sm text-ink-600 dark:text-ink-300">
                {t.waitlistPage.explain}
              </p>
            )}
          </Card>

          <Card className="px-5 py-4">
            <h2 className="font-semibold text-ink-900 dark:text-white">รายละเอียดก๊วน</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500 dark:text-ink-400">เวลา</dt>
                <dd className="text-right font-medium text-ink-900 dark:text-white">
                  {formatDateLong(session.starts_at)} ·{' '}
                  {formatTimeRange(session.starts_at, session.ends_at)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500 dark:text-ink-400">ผู้เล่น</dt>
                <dd className="text-right font-medium text-ink-900 dark:text-white">
                  {counts.paid} / {session.target_players} คน · คิวสำรอง {counts.waitlisted} คน
                </dd>
              </div>
            </dl>
            <Link
              href={`/s/${code}`}
              className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              ดูรายละเอียดทั้งหมด →
            </Link>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <JoinPanel
            sessionId={session.id}
            publicCode={session.public_code}
            status={session.status}
            slotsLeft={counts.slotsLeft}
            amountThb={session.budget_per_person_thb}
            paymentDeadline={session.payment_deadline}
            startsAt={session.starts_at}
            isSignedIn
            participant={participant ?? null}
            waitlistEntry={waitlistEntry}
            deadlinePassed={new Date(session.payment_deadline).getTime() <= now}
            sessionStarted={new Date(session.starts_at).getTime() <= now}
            participantPaymentOverdue={
              participant ? new Date(participant.payment_due_at).getTime() <= now : false
            }
          />
        </aside>
      </div>
    </AppShell>
  );
}
