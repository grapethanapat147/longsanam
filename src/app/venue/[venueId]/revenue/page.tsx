import { Card, Stat } from '@/components/ui/primitives';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatThb } from '@/lib/format';
import { LOCALE, TIME_ZONE } from '@/i18n';

/**
 * Revenue counts confirmed bookings only. A requested or held booking is not
 * money, and showing it as revenue would misrepresent what the venue has earned.
 */
export default async function VenueRevenuePage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const admin = createAdminClient();

  const { data } = await admin
    .from('bookings')
    .select('id, status, price_thb, starts_at, courts (name)')
    .eq('venue_id', venueId)
    .eq('status', 'confirmed')
    .order('starts_at', { ascending: false })
    .limit(500);

  const bookings = (data ?? []) as unknown as {
    id: string;
    price_thb: number;
    starts_at: string;
    courts: { name: string } | null;
  }[];

  const now = new Date();
  const monthFormatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    month: 'long',
    year: 'numeric',
  });
  const monthKey = (iso: string) => monthFormatter.format(new Date(iso));
  const thisMonth = monthKey(now.toISOString());

  const total = bookings.reduce((sum, b) => sum + b.price_thb, 0);
  const currentMonthTotal = bookings
    .filter((b) => monthKey(b.starts_at) === thisMonth)
    .reduce((sum, b) => sum + b.price_thb, 0);
  const average = bookings.length > 0 ? Math.round(total / bookings.length) : 0;

  const byMonth = new Map<string, { total: number; count: number }>();
  for (const booking of bookings) {
    const key = monthKey(booking.starts_at);
    const entry = byMonth.get(key) ?? { total: 0, count: 0 };
    entry.total += booking.price_thb;
    entry.count += 1;
    byMonth.set(key, entry);
  }

  const byCourt = new Map<string, { total: number; count: number }>();
  for (const booking of bookings) {
    const key = booking.courts?.name ?? '—';
    const entry = byCourt.get(key) ?? { total: 0, count: 0 };
    entry.total += booking.price_thb;
    entry.count += 1;
    byCourt.set(key, entry);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="รายได้รวม" value={formatThb(total)} tone="positive" />
        <Stat label={`เดือนนี้ (${thisMonth})`} value={formatThb(currentMonthTotal)} />
        <Stat label="จำนวนการจอง" value={`${bookings.length}`} />
        <Stat label="เฉลี่ยต่อการจอง" value={formatThb(average)} />
      </div>

      <Card className="px-5 py-4">
        <h2 className="font-semibold text-ink-900 dark:text-white">แยกตามเดือน</h2>
        {byMonth.size === 0 ? (
          <p className="mt-2 text-sm text-ink-500">ยังไม่มีการจองที่ยืนยันแล้ว</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-200 dark:divide-white/10">
            {[...byMonth.entries()].map(([month, entry]) => (
              <li key={month} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-700 dark:text-ink-200">
                  {month}
                  <span className="ml-2 text-xs text-ink-500">{entry.count} การจอง</span>
                </span>
                <span className="font-semibold tabular-nums text-ink-900 dark:text-white">
                  {formatThb(entry.total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="px-5 py-4">
        <h2 className="font-semibold text-ink-900 dark:text-white">แยกตามคอร์ต</h2>
        {byCourt.size === 0 ? (
          <p className="mt-2 text-sm text-ink-500">ยังไม่มีข้อมูล</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-200 dark:divide-white/10">
            {[...byCourt.entries()]
              .sort((a, b) => b[1].total - a[1].total)
              .map(([court, entry]) => (
                <li key={court} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink-700 dark:text-ink-200">
                    {court}
                    <span className="ml-2 text-xs text-ink-500">{entry.count} การจอง</span>
                  </span>
                  <span className="font-semibold tabular-nums text-ink-900 dark:text-white">
                    {formatThb(entry.total)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
