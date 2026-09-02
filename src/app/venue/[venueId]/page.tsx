import { AutoConfirmToggle } from '@/components/venue-forms';
import { BookingStatusChip } from '@/components/status';
import { Card, Stat, ButtonLink } from '@/components/ui/primitives';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatThb, formatTimeRange } from '@/lib/format';
import { requestNow } from '@/lib/server-time';
import { t } from '@/i18n';
import type { BookingStatus } from '@/lib/domain/types';

export default async function VenueOverviewPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: venue }, { data: courts }, { data: bookings }] = await Promise.all([
    supabase.from('venues').select('auto_confirm_bookings').eq('id', venueId).maybeSingle(),
    supabase.from('courts').select('id, is_active').eq('venue_id', venueId),
    admin
      .from('bookings')
      .select('id, status, price_thb, starts_at, ends_at, courts (name), sessions!bookings_session_id_fkey (title)')
      .eq('venue_id', venueId)
      .order('starts_at', { ascending: true })
      .limit(200),
  ]);

  const rows = (bookings ?? []) as unknown as {
    id: string;
    status: BookingStatus;
    price_thb: number;
    starts_at: string;
    ends_at: string;
    courts: { name: string } | null;
    sessions: { title: string } | null;
  }[];

  const now = requestNow();
  const pendingRequests = rows.filter((b) => b.status === 'requested' || b.status === 'held');
  const upcoming = rows.filter(
    (b) => b.status === 'confirmed' && new Date(b.starts_at).getTime() > now,
  );
  const confirmedRevenue = rows
    .filter((b) => b.status === 'confirmed')
    .reduce((sum, b) => sum + b.price_thb, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="คอร์ตทั้งหมด" value={`${courts?.length ?? 0}`} hint={`เปิดใช้ ${(courts ?? []).filter((c) => c.is_active).length}`} />
        <Stat
          label="คำขอที่รอตอบ"
          value={`${pendingRequests.length}`}
          tone={pendingRequests.length > 0 ? 'negative' : 'default'}
        />
        <Stat label="การจองที่กำลังจะถึง" value={`${upcoming.length}`} />
        <Stat label="รายได้จากการจองที่ยืนยัน" value={formatThb(confirmedRevenue)} tone="positive" />
      </div>

      <AutoConfirmToggle venueId={venueId} enabled={Boolean(venue?.auto_confirm_bookings)} />

      <Card className="px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink-900 dark:text-white">การจองที่กำลังจะถึง</h2>
          <ButtonLink href={`/venue/${venueId}/inbox`} variant="secondary" size="sm">
            {t.venue.inbox}
          </ButtonLink>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">ยังไม่มีการจองที่ยืนยันแล้วในอนาคต</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-200 dark:divide-white/10">
            {upcoming.slice(0, 8).map((booking) => (
              <li key={booking.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900 dark:text-white">
                    {booking.sessions?.title ?? 'ก๊วน'} · {booking.courts?.name}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {formatDate(booking.starts_at)} ·{' '}
                    {formatTimeRange(booking.starts_at, booking.ends_at)} ·{' '}
                    {formatThb(booking.price_thb)}
                  </p>
                </div>
                <BookingStatusChip status={booking.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
