import { BlockSlotForm, RemoveBlockButton } from '@/components/venue-forms';
import { BookingStatusChip } from '@/components/status';
import { Card, Chip, EmptyState } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatDateLong, formatThb, formatTimeRange } from '@/lib/format';
import { requestNow } from '@/lib/server-time';
import { t } from '@/i18n';
import type { BookingStatus } from '@/lib/domain/types';

/** Groups everything happening on a court into day buckets, Bangkok-local. */
function dayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export default async function VenueCalendarPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const now = requestNow();
  const horizon = new Date(now + 30 * 86_400_000).toISOString();
  const since = new Date(now - 86_400_000).toISOString();

  const [{ data: courts }, { data: bookings }, { data: holds }, { data: blocks }] =
    await Promise.all([
      supabase.from('courts').select('id, name').eq('venue_id', venueId).order('name'),
      admin
        .from('bookings')
        .select(
          'id, status, price_thb, starts_at, ends_at, court_id, courts (name), sessions!bookings_session_id_fkey (title)',
        )
        .eq('venue_id', venueId)
        .in('status', ['requested', 'held', 'confirmed'])
        .gte('starts_at', since)
        .lte('starts_at', horizon)
        .order('starts_at'),
      admin
        .from('court_holds')
        .select('id, starts_at, ends_at, expires_at, court_id, courts (name, venue_id)')
        .eq('status', 'active')
        .gte('starts_at', since)
        .order('starts_at'),
      supabase
        .from('court_availability')
        .select('id, kind, starts_at, ends_at, reason, court_id, courts!inner (name, venue_id)')
        .in('kind', ['blackout', 'manual_block'])
        .eq('courts.venue_id', venueId)
        .gte('ends_at', since)
        .order('starts_at'),
    ]);

  const courtList = (courts ?? []) as { id: string; name: string }[];

  const bookingRows = (bookings ?? []) as unknown as {
    id: string;
    status: BookingStatus;
    price_thb: number;
    starts_at: string;
    ends_at: string;
    courts: { name: string } | null;
    sessions: { title: string } | null;
  }[];

  const holdRows = (
    (holds ?? []) as unknown as {
      id: string;
      starts_at: string;
      ends_at: string;
      expires_at: string;
      courts: { name: string; venue_id: string } | null;
    }[]
  ).filter((hold) => hold.courts && courtList.some((c) => c.name === hold.courts!.name));

  const blockRows = (blocks ?? []) as unknown as {
    id: string;
    kind: string;
    starts_at: string;
    ends_at: string;
    reason: string | null;
    courts: { name: string } | null;
  }[];

  type Item = {
    key: string;
    day: string;
    startsAt: string;
    endsAt: string;
    courtName: string;
    node: React.ReactNode;
  };

  const items: Item[] = [
    ...bookingRows.map((booking) => ({
      key: `b-${booking.id}`,
      day: dayKey(booking.starts_at),
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      courtName: booking.courts?.name ?? '',
      node: (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-900">
              {booking.sessions?.title ?? 'ก๊วน'}
            </p>
            <p className="text-xs text-ink-500">
              {booking.courts?.name} · {formatTimeRange(booking.starts_at, booking.ends_at)} ·{' '}
              {formatThb(booking.price_thb)}
            </p>
          </div>
          <BookingStatusChip status={booking.status} />
        </div>
      ),
    })),
    ...holdRows.map((hold) => ({
      key: `h-${hold.id}`,
      day: dayKey(hold.starts_at),
      startsAt: hold.starts_at,
      endsAt: hold.ends_at,
      courtName: hold.courts?.name ?? '',
      node: (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-900">กันคอร์ตชั่วคราว</p>
            <p className="text-xs text-ink-500">
              {hold.courts?.name} · {formatTimeRange(hold.starts_at, hold.ends_at)}
            </p>
          </div>
          <Chip tone="warning">กำลังกัน</Chip>
        </div>
      ),
    })),
    ...blockRows.map((block) => ({
      key: `x-${block.id}`,
      day: dayKey(block.starts_at),
      startsAt: block.starts_at,
      endsAt: block.ends_at,
      courtName: block.courts?.name ?? '',
      node: (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-900">
              {block.kind === 'blackout' ? 'ปิดปรับปรุง' : 'ปิดชั่วคราว'}
            </p>
            <p className="text-xs text-ink-500">
              {block.courts?.name} · {formatTimeRange(block.starts_at, block.ends_at)}
              {block.reason ? ` · ${block.reason}` : ''}
            </p>
          </div>
          <RemoveBlockButton blockId={block.id} venueId={venueId} />
        </div>
      ),
    })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const days = [...new Set(items.map((item) => item.day))];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        {days.length === 0 ? (
          <EmptyState
            icon="📅"
            title="ยังไม่มีรายการในช่วง 30 วันข้างหน้า"
            description="เมื่อมีก๊วนจองคอร์ต หรือคุณปิดคอร์ตเอง รายการจะแสดงที่นี่"
          />
        ) : (
          days.map((day) => (
            <Card key={day} className="px-5 py-4">
              <h2 className="font-semibold text-ink-900">
                {formatDateLong(`${day}T00:00:00+07:00`)}
              </h2>
              <ul className="mt-3 divide-y divide-ink-200">
                {items
                  .filter((item) => item.day === day)
                  .map((item) => (
                    <li key={item.key} className="py-2">
                      {item.node}
                    </li>
                  ))}
              </ul>
            </Card>
          ))
        )}
      </div>

      <aside>
        <Card className="px-5 py-5">
          <h2 className="mb-3 font-semibold text-ink-900">{t.venue.blockSlot}</h2>
          {courtList.length === 0 ? (
            <p className="text-sm text-ink-500">เพิ่มคอร์ตก่อนจึงจะปิดช่วงเวลาได้</p>
          ) : (
            <BlockSlotForm venueId={venueId} courts={courtList} />
          )}
        </Card>
      </aside>
    </div>
  );
}
