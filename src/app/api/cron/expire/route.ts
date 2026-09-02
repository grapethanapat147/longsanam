import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Scheduled maintenance.
 *
 * Court holds must expire on their own, otherwise a failed orchestration would
 * park a court indefinitely. Same for unpaid slots and unclaimed waitlist
 * promotions: each one is holding capacity that belongs to somebody else.
 *
 * Point a scheduler (Vercel Cron, GitHub Actions, or Supabase pg_cron) at this
 * route every minute or two:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/expire
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not configured' },
      { status: 503 },
    );
  }

  const provided =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.nextUrl.searchParams.get('secret');

  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const [holds, payments, promotions] = await Promise.all([
    admin.rpc('expire_stale_holds'),
    admin.rpc('expire_overdue_payments'),
    admin.rpc('expire_waitlist_promotions'),
  ]);

  const error = holds.error ?? payments.error ?? promotions.error;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    holds: holds.data,
    payments: payments.data,
    waitlist: promotions.data,
  });
}

export const GET = POST;
