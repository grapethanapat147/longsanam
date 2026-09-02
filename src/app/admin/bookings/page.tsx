import Link from 'next/link';
import { BookingStatusChip, PaymentStatusChip, RefundStatusChip } from '@/components/status';
import { ManualRefundForm } from '@/components/admin-controls';
import { Card } from '@/components/ui/primitives';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatDate, formatDateTime, formatThb } from '@/lib/format';
import { t } from '@/i18n';
import type { BookingStatus, PaymentStatus, RefundStatus } from '@/lib/domain/types';

export default async function AdminBookingsPage() {
  const admin = createAdminClient();

  const [{ data: bookings }, { data: payments }, { data: refunds }] = await Promise.all([
    admin
      .from('bookings')
      .select(
        'id, status, price_thb, starts_at, attempt_no, venues (name), courts (name), sessions!bookings_session_id_fkey (title, public_code)',
      )
      .order('requested_at', { ascending: false })
      .limit(50),
    admin
      .from('payments')
      .select(
        'id, amount_thb, status, provider, created_at, paid_at, profiles:user_id (display_name), sessions (title)',
      )
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('refunds')
      .select('id, amount_thb, status, reason, created_at, sessions (title)')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const bookingRows = (bookings ?? []) as unknown as {
    id: string;
    status: BookingStatus;
    price_thb: number;
    starts_at: string;
    attempt_no: number;
    venues: { name: string } | null;
    courts: { name: string } | null;
    sessions: { title: string; public_code: string } | null;
  }[];

  const paymentRows = (payments ?? []) as unknown as {
    id: string;
    amount_thb: number;
    status: PaymentStatus;
    provider: string;
    created_at: string;
    paid_at: string | null;
    profiles: { display_name: string } | null;
    sessions: { title: string } | null;
  }[];

  const refundRows = (refunds ?? []) as unknown as {
    id: string;
    amount_thb: number;
    status: RefundStatus;
    reason: string;
    created_at: string;
    sessions: { title: string } | null;
  }[];

  const refundablePayments = paymentRows
    .filter((payment) => payment.status === 'paid')
    .map((payment) => ({
      id: payment.id,
      amountThb: payment.amount_thb,
      label: `${payment.profiles?.display_name ?? 'ผู้เล่น'} · ${payment.sessions?.title ?? 'ก๊วน'} · ${formatThb(payment.amount_thb)}`,
    }));

  return (
    <div className="space-y-5">
      <Card className="px-5 py-4">
        <h2 className="font-semibold text-ink-900 dark:text-white">{t.admin.disputes}</h2>
        <p className="mt-1 mb-4 text-sm text-ink-600 dark:text-ink-300">
          ใช้เมื่อผู้เล่นร้องเรียนและต้องคืนเงินนอกเหนือจากเงื่อนไขปกติ
          ระบบจะจำกัดยอดคืนไม่ให้เกินยอดที่ชำระจริง
        </p>
        <ManualRefundForm payments={refundablePayments} />
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="px-5 pt-4 font-semibold text-ink-900 dark:text-white">การจองล่าสุด</h2>
        <table className="mt-3 w-full min-w-[46rem] text-sm">
          <thead className="border-b border-ink-200 text-left text-xs text-ink-500 dark:border-white/10 dark:text-ink-400">
            <tr>
              <th className="px-4 py-3 font-medium">ก๊วน</th>
              <th className="px-4 py-3 font-medium">สนาม / คอร์ต</th>
              <th className="px-4 py-3 font-medium">วันที่เล่น</th>
              <th className="px-4 py-3 text-right font-medium">ราคา</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-white/10">
            {bookingRows.map((booking) => (
              <tr key={booking.id}>
                <td className="max-w-48 truncate px-4 py-3 text-ink-900 dark:text-white">
                  {booking.sessions ? (
                    <Link
                      href={`/s/${booking.sessions.public_code}`}
                      className="hover:underline focus-ring"
                    >
                      {booking.sessions.title}
                    </Link>
                  ) : (
                    '—'
                  )}
                  <span className="block text-xs text-ink-500">ครั้งที่ {booking.attempt_no}</span>
                </td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                  {booking.venues?.name} · {booking.courts?.name}
                </td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                  {formatDate(booking.starts_at)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-900 dark:text-white">
                  {formatThb(booking.price_thb)}
                </td>
                <td className="px-4 py-3">
                  <BookingStatusChip status={booking.status} />
                </td>
              </tr>
            ))}
            {bookingRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-500">
                  {t.common.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="px-5 pt-4 font-semibold text-ink-900 dark:text-white">การชำระเงินล่าสุด</h2>
        <table className="mt-3 w-full min-w-[42rem] text-sm">
          <thead className="border-b border-ink-200 text-left text-xs text-ink-500 dark:border-white/10 dark:text-ink-400">
            <tr>
              <th className="px-4 py-3 font-medium">ผู้เล่น</th>
              <th className="px-4 py-3 font-medium">ก๊วน</th>
              <th className="px-4 py-3 font-medium">เวลา</th>
              <th className="px-4 py-3 text-right font-medium">จำนวน</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-white/10">
            {paymentRows.map((payment) => (
              <tr key={payment.id}>
                <td className="px-4 py-3 text-ink-900 dark:text-white">
                  {payment.profiles?.display_name ?? '—'}
                </td>
                <td className="max-w-48 truncate px-4 py-3 text-ink-600 dark:text-ink-300">
                  {payment.sessions?.title ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
                  {formatDateTime(payment.paid_at ?? payment.created_at)}
                  {payment.provider === 'mock' ? ` · ${t.mock.badge}` : ''}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-900 dark:text-white">
                  {formatThb(payment.amount_thb)}
                </td>
                <td className="px-4 py-3">
                  <PaymentStatusChip status={payment.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="px-5 pt-4 font-semibold text-ink-900 dark:text-white">การคืนเงินล่าสุด</h2>
        <table className="mt-3 w-full min-w-[38rem] text-sm">
          <thead className="border-b border-ink-200 text-left text-xs text-ink-500 dark:border-white/10 dark:text-ink-400">
            <tr>
              <th className="px-4 py-3 font-medium">ก๊วน</th>
              <th className="px-4 py-3 font-medium">เหตุผล</th>
              <th className="px-4 py-3 text-right font-medium">จำนวน</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-white/10">
            {refundRows.map((refund) => (
              <tr key={refund.id}>
                <td className="max-w-40 truncate px-4 py-3 text-ink-900 dark:text-white">
                  {refund.sessions?.title ?? '—'}
                </td>
                <td className="max-w-64 truncate px-4 py-3 text-ink-600 dark:text-ink-300">
                  {refund.reason}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-900 dark:text-white">
                  {formatThb(refund.amount_thb)}
                </td>
                <td className="px-4 py-3">
                  <RefundStatusChip status={refund.status} />
                </td>
              </tr>
            ))}
            {refundRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-500">
                  {t.common.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
