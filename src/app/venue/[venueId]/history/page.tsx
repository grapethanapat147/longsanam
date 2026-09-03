import { BookingStatusChip } from '@/components/status';
import { Card, EmptyState } from '@/components/ui/primitives';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatDate, formatThb, formatTimeRange } from '@/lib/format';
import type { BookingStatus } from '@/lib/domain/types';

export default async function VenueHistoryPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from('bookings')
    .select(
      'id, status, price_thb, starts_at, ends_at, attempt_no, decision_reason, confirmed_at, courts (name), sessions!bookings_session_id_fkey (title, public_code)',
    )
    .eq('venue_id', venueId)
    .order('starts_at', { ascending: false })
    .limit(100);

  const bookings = (data ?? []) as unknown as {
    id: string;
    status: BookingStatus;
    price_thb: number;
    starts_at: string;
    ends_at: string;
    attempt_no: number;
    decision_reason: string | null;
    courts: { name: string } | null;
    sessions: { title: string; public_code: string } | null;
  }[];

  if (bookings.length === 0) {
    return <EmptyState icon="🗂️" title="ยังไม่มีประวัติการจอง" />;
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="border-b border-ink-200 text-left text-xs text-ink-500">
          <tr>
            <th className="px-4 py-3 font-medium">วันที่</th>
            <th className="px-4 py-3 font-medium">ก๊วน</th>
            <th className="px-4 py-3 font-medium">คอร์ต</th>
            <th className="px-4 py-3 text-right font-medium">ราคา</th>
            <th className="px-4 py-3 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200">
          {bookings.map((booking) => (
            <tr key={booking.id}>
              <td className="px-4 py-3 text-ink-700">
                {formatDate(booking.starts_at)}
                <span className="block text-xs text-ink-500">
                  {formatTimeRange(booking.starts_at, booking.ends_at)}
                </span>
              </td>
              <td className="max-w-48 truncate px-4 py-3 text-ink-900">
                {booking.sessions?.title ?? '—'}
                {booking.decision_reason ? (
                  <span className="block truncate text-xs text-ink-500">
                    {booking.decision_reason}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-ink-700">{booking.courts?.name ?? '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums text-ink-900">
                {formatThb(booking.price_thb)}
              </td>
              <td className="px-4 py-3">
                <BookingStatusChip status={booking.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
