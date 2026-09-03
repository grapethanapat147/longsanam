import { NextResponse, type NextRequest } from 'next/server';
import { runLifecycleSweeps } from '@/lib/lifecycle';

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

  try {
    const result = await runLifecycleSweeps();
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error('[cron/expire] sweep failed', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'sweep failed',
      },
      { status: 500 },
    );
  }
}

export const GET = POST;
