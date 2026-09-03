import { BookingDecisionButtons } from '@/components/venue-forms';
import { LiveVenueBookings } from '@/components/live-updates';
import { BookingStatusChip } from '@/components/status';
import { Alert, Card, EmptyState } from '@/components/ui/primitives';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { formatCountdown, formatDateLong, formatThb, formatTimeRange } from '@/lib/format';
import { t } from '@/i18n';
import type { BookingStatus } from '@/lib/domain/types';

export default async function VenueInboxPage({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: venue }, { data: rows }] = await Promise.all([
    supabase.from('venues').select('auto_confirm_bookings').eq('id', venueId).maybeSingle(),
    admin
      .from('bookings')
      .select(
        'id, status, price_thb, starts_at, ends_at, expires_at, requested_at, attempt_no, courts (name), sessions!bookings_session_id_fkey (title, public_code, target_players)',
      )
      .eq('venue_id', venueId)
      .in('status', ['requested', 'held'])
      .order('requested_at', { ascending: true }),
  ]);

  const requests = (rows ?? []) as unknown as {
    id: string;
    status: BookingStatus;
    price_thb: number;
    starts_at: string;
    ends_at: string;
    expires_at: string | null;
    attempt_no: number;
    courts: { name: string } | null;
    sessions: {
      title: string;
      public_code: string;
      target_players: number;
    } | null;
  }[];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <LiveVenueBookings venueId={venueId} />
      </div>
      {venue?.auto_confirm_bookings ? (
        <Alert tone="info" title="สนามนี้เปิดยืนยันอัตโนมัติอยู่">
          คำขอส่วนใหญ่จะถูกยืนยันทันทีโดยไม่เข้ามาที่กล่องนี้
          รายการที่เห็นด้านล่างคือรายการที่ยังค้างอยู่
        </Alert>
      ) : null}

      {requests.length === 0 ? (
        <EmptyState icon="📭" title={t.venue.noRequests} description="คำขอจองใหม่จะปรากฏที่นี่" />
      ) : (
        requests.map((request) => (
          <Card key={request.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink-900">
                    {request.sessions?.title ?? 'ก๊วน'}
                  </h2>
                  <BookingStatusChip status={request.status} />
                </div>
                <dl className="mt-2 space-y-1 text-sm text-ink-600">
                  <div>
                    📅 {formatDateLong(request.starts_at)} ·{' '}
                    {formatTimeRange(request.starts_at, request.ends_at)}
                  </div>
                  <div>🏟️ {request.courts?.name}</div>
                  <div>
                    💰 {formatThb(request.price_thb)} · ผู้เล่นสูงสุด{' '}
                    {request.sessions?.target_players ?? '—'} คน
                  </div>
                  {request.expires_at ? (
                    <div className="text-amber-700">
                      ⏳ คำขอหมดอายุ {formatCountdown(request.expires_at)}
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="shrink-0">
                <BookingDecisionButtons bookingId={request.id} />
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
