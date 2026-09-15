import Link from 'next/link';
import { Card, Chip } from '@/components/ui/primitives';
import { VenueActiveToggle } from '@/components/admin-controls';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatThb } from '@/lib/format';

export default async function AdminVenuesPage() {
  const admin = createAdminClient();

  const [{ data: venues }, { data: courts }, { data: bookings }] = await Promise.all([
    admin
      .from('venues')
      .select('id, name, district, province, is_active, auto_confirm_bookings, created_at')
      .order('created_at', { ascending: false }),
    admin.from('courts').select('id, venue_id, is_active'),
    admin.from('bookings').select('venue_id, status, price_thb'),
  ]);

  const courtCount = new Map<string, number>();
  for (const court of (courts ?? []) as { venue_id: string }[]) {
    courtCount.set(court.venue_id, (courtCount.get(court.venue_id) ?? 0) + 1);
  }

  const revenue = new Map<string, number>();
  for (const booking of (bookings ?? []) as {
    venue_id: string | null;
    status: string;
    price_thb: number;
  }[]) {
    // A court the organizer confirmed themselves (LSN-0025) belongs to no venue
    // we know about, so it is nobody's revenue. Skipped openly rather than left
    // to land in the map under a null key that nothing ever reads.
    if (booking.venue_id === null) continue;
    if (booking.status === 'confirmed') {
      revenue.set(booking.venue_id, (revenue.get(booking.venue_id) ?? 0) + booking.price_thb);
    }
  }

  const rows = (venues ?? []) as {
    id: string;
    name: string;
    district: string;
    province: string;
    is_active: boolean;
    auto_confirm_bookings: boolean;
  }[];

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <thead className="border-b border-ink-200 text-left text-xs text-ink-500">
          <tr>
            <th className="px-4 py-3 font-medium">สนาม</th>
            <th className="px-4 py-3 font-medium">พื้นที่</th>
            <th className="px-4 py-3 text-right font-medium">คอร์ต</th>
            <th className="px-4 py-3 text-right font-medium">รายได้</th>
            <th className="px-4 py-3 font-medium">การยืนยัน</th>
            <th className="px-4 py-3 text-right font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200">
          {rows.map((venue) => (
            <tr key={venue.id}>
              <td className="px-4 py-3 font-medium text-ink-900">
                <Link href={`/venue/${venue.id}`} className="hover:underline focus-ring">
                  {venue.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-600">
                {venue.district} · {venue.province}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-ink-700">
                {courtCount.get(venue.id) ?? 0}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-ink-900">
                {formatThb(revenue.get(venue.id) ?? 0)}
              </td>
              <td className="px-4 py-3">
                <Chip tone={venue.auto_confirm_bookings ? 'info' : 'warning'}>
                  {venue.auto_confirm_bookings ? 'อัตโนมัติ' : 'อนุมัติเอง'}
                </Chip>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end">
                  <VenueActiveToggle venueId={venue.id} isActive={venue.is_active} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
