import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { PaymentStatusChip, RefundStatusChip } from '@/components/status';
import { Card, EmptyState, PageHeader, Stat } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { formatDateTime, formatThb } from '@/lib/format';
import { t } from '@/i18n';
import type { PaymentStatus, RefundStatus } from '@/lib/domain/types';

export const metadata: Metadata = { title: t.nav.payments };

type PaymentRow = {
  id: string;
  amount_thb: number;
  status: PaymentStatus;
  provider: string;
  provider_ref: string | null;
  created_at: string;
  paid_at: string | null;
  sessions: { public_code: string; title: string } | null;
};

type RefundRow = {
  id: string;
  amount_thb: number;
  status: RefundStatus;
  reason: string;
  created_at: string;
  processed_at: string | null;
  sessions: { public_code: string; title: string } | null;
};

export default async function PaymentsPage() {
  const user = await requireUser('/app/payments');
  const supabase = await createClient();

  const [{ data: payments }, { data: refunds }] = await Promise.all([
    supabase
      .from('payments')
      .select('id, amount_thb, status, provider, provider_ref, created_at, paid_at, sessions (public_code, title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('refunds')
      .select('id, amount_thb, status, reason, created_at, processed_at, sessions (public_code, title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const paymentRows = (payments ?? []) as unknown as PaymentRow[];
  const refundRows = (refunds ?? []) as unknown as RefundRow[];

  const totalPaid = paymentRows
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount_thb, 0);
  const totalRefunded = refundRows
    .filter((r) => r.status === 'completed')
    .reduce((sum, r) => sum + r.amount_thb, 0);
  const pending = paymentRows.filter((p) => p.status === 'pending').length;

  return (
    <AppShell>
      <PageHeader title={t.nav.payments} description="ประวัติการชำระเงินและการคืนเงินของคุณ" />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="ชำระแล้วทั้งหมด" value={formatThb(totalPaid)} tone="positive" />
        <Stat label="ได้รับคืน" value={formatThb(totalRefunded)} />
        <Stat label="รอชำระ" value={`${pending} รายการ`} tone={pending > 0 ? 'negative' : 'default'} />
      </div>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-ink-900 dark:text-white">{t.payment.history}</h2>
        {paymentRows.length === 0 ? (
          <EmptyState icon="🧾" title="ยังไม่มีรายการชำระเงิน" />
        ) : (
          <div className="space-y-2">
            {paymentRows.map((payment) => (
              <Card key={payment.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {payment.sessions ? (
                      <Link
                        href={`/s/${payment.sessions.public_code}`}
                        className="truncate font-medium text-ink-900 hover:underline focus-ring dark:text-white"
                      >
                        {payment.sessions.title}
                      </Link>
                    ) : (
                      <p className="font-medium text-ink-900 dark:text-white">—</p>
                    )}
                    <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                      {formatDateTime(payment.paid_at ?? payment.created_at)}
                      {payment.provider === 'mock' ? ` · ${t.mock.badge}` : ''}
                      {payment.provider_ref ? ` · ${payment.provider_ref}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-bold tabular-nums text-ink-900 dark:text-white">
                      {formatThb(payment.amount_thb)}
                    </span>
                    <PaymentStatusChip status={payment.status} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-ink-900 dark:text-white">{t.payment.refunds}</h2>
        {refundRows.length === 0 ? (
          <EmptyState icon="↩️" title="ยังไม่มีรายการคืนเงิน" />
        ) : (
          <div className="space-y-2">
            {refundRows.map((refund) => (
              <Card key={refund.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900 dark:text-white">
                      {refund.sessions?.title ?? '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                      {refund.reason} · {formatDateTime(refund.processed_at ?? refund.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-bold tabular-nums text-brand-700 dark:text-brand-300">
                      +{formatThb(refund.amount_thb)}
                    </span>
                    <RefundStatusChip status={refund.status} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
