import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { JoinPanel } from '@/components/join-panel';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { loadMyParticipation, loadSessionByCode } from '@/lib/queries';
import { requireUser } from '@/lib/auth';
import { describePolicy } from '@/lib/domain/refund';
import { formatDateLong, formatThb, formatTimeRange } from '@/lib/format';
import { getPaymentProvider } from '@/lib/payments';
import { t } from '@/i18n';
import { requestNow } from '@/lib/server-time';

export const metadata: Metadata = { title: t.payment.title };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await loadSessionByCode(code);
  if (!result) notFound();

  const user = await requireUser(`/s/${code}/join`);
  const { session, counts, policy } = result;
  const { participant, waitlistEntry } = await loadMyParticipation(user.id, session.id);
  const provider = getPaymentProvider();
  const now = requestNow();

  // Somebody sent to the payment page while the queue is where they belong.
  if (!participant && waitlistEntry && waitlistEntry.status === 'waiting') {
    redirect(`/s/${code}/waitlist`);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={session.sports?.name_th}
        title={session.title}
        description={`${formatDateLong(session.starts_at)} · ${formatTimeRange(session.starts_at, session.ends_at)}`}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {provider.isMock ? (
            <Alert tone="warning" title={`${t.mock.badge} — ${provider.displayLabel}`}>
              {t.mock.paymentNotice}
            </Alert>
          ) : null}

          <Card className="px-5 py-4">
            <h2 className="font-semibold text-ink-900 dark:text-white">สรุปรายการ</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="ก๊วน" value={session.title} />
              <Row label="สถานที่" value={session.area_text} />
              <Row
                label="เวลา"
                value={`${formatDateLong(session.starts_at)} ${formatTimeRange(session.starts_at, session.ends_at)}`}
              />
              <Row label="ผู้เล่นที่ยืนยันแล้ว" value={`${counts.paid} / ${session.target_players} คน`} />
              <div className="flex justify-between border-t border-ink-200 pt-2 dark:border-white/10">
                <dt className="font-semibold text-ink-900 dark:text-white">{t.payment.amountDue}</dt>
                <dd className="font-bold text-ink-900 dark:text-white">
                  {formatThb(participant?.amount_due_thb ?? session.budget_per_person_thb)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="px-5 py-4">
            <h2 className="font-semibold text-ink-900 dark:text-white">{t.session.policy}</h2>
            <ul className="mt-2 space-y-1 text-sm text-ink-600 dark:text-ink-300">
              {describePolicy(policy).map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          </Card>

          <Link
            href={`/s/${code}`}
            className="inline-block text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            ← กลับไปหน้ารายละเอียดก๊วน
          </Link>
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
            waitlistEntry={waitlistEntry ?? null}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-500 dark:text-ink-400">{label}</dt>
      <dd className="text-right font-medium text-ink-900 dark:text-white">{value}</dd>
    </div>
  );
}
