import { CourtForm, OpeningHoursForm } from '@/components/venue-forms';
import { Card, Chip } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { loadSports } from '@/lib/queries';
import { formatThb } from '@/lib/format';
import { t } from '@/i18n';

export default async function VenueCourtsPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const supabase = await createClient();

  const [sports, { data: courtRows }] = await Promise.all([
    loadSports(),
    supabase
      .from('courts')
      .select(
        'id, name, capacity, base_price_thb, min_booking_minutes, is_active, court_sports (sport_id), court_availability (id, kind, weekday, opens_at, closes_at)',
      )
      .eq('venue_id', venueId)
      .order('name', { ascending: true }),
  ]);

  const courts = (courtRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    base_price_thb: row.base_price_thb,
    min_booking_minutes: row.min_booking_minutes,
    is_active: row.is_active,
    sportIds: (row.court_sports as unknown as { sport_id: string }[]).map((s) => s.sport_id),
    openingHours: (
      row.court_availability as unknown as {
        id: string;
        kind: string;
        weekday: number | null;
        opens_at: string | null;
        closes_at: string | null;
      }[]
    )
      .filter((a) => a.kind === 'opening_hours' && a.weekday !== null)
      .map((a) => ({
        weekday: a.weekday as number,
        opens_at: a.opens_at ?? '06:00',
        closes_at: a.closes_at ?? '23:00',
      }))
      .sort((a, b) => a.weekday - b.weekday),
  }));

  return (
    <div className="space-y-5">
      <Card className="px-5 py-5">
        <h2 className="font-semibold text-ink-900">เพิ่มคอร์ตใหม่</h2>
        <p className="mt-1 mb-4 text-sm text-ink-600">
          คอร์ตใหม่จะถูกตั้งเวลาทำการเริ่มต้น 06:00–23:00 ทุกวัน ปรับได้ทีหลัง
        </p>
        <CourtForm venueId={venueId} sports={sports} />
      </Card>

      {courts.length === 0 ? null : (
        <div className="space-y-4">
          <h2 className="font-semibold text-ink-900">
            {t.venue.courts} ({courts.length})
          </h2>
          {courts.map((court) => (
            <Card key={court.id} className="px-5 py-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-ink-900">{court.name}</h3>
                <Chip tone={court.is_active ? 'success' : 'neutral'}>
                  {court.is_active ? 'เปิดให้จอง' : 'ปิด'}
                </Chip>
                <Chip tone="brand">{formatThb(court.base_price_thb)}/ชม.</Chip>
                <Chip tone="neutral">{court.capacity} คน</Chip>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-ink-700">รายละเอียดคอร์ต</h4>
                  <CourtForm venueId={venueId} sports={sports} court={court} />
                </div>
                <div className="border-t border-ink-200 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <h4 className="mb-2 text-sm font-semibold text-ink-700">
                    {t.venue.availability}
                  </h4>
                  <OpeningHoursForm
                    venueId={venueId}
                    courtId={court.id}
                    current={court.openingHours}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
