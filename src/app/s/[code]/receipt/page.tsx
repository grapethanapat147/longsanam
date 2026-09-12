import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { ShareLink } from '@/components/share-link';
import { Card, Chip, Stat } from '@/components/ui/primitives';
import { loadSessionReceipt } from '@/lib/queries';
import { getCurrentUser } from '@/lib/auth';
import { formatDateLong, formatThb } from '@/lib/format';
import { t } from '@/i18n';

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  // Metadata is what a stranger's chat app reads, so it is built from the
  // masked view on purpose — no viewer, no names, even for the organizer.
  const data = await loadSessionReceipt(code, null);
  if (!data) return { title: t.receipt.title };
  const { totals } = data;
  return {
    title: `${t.receipt.title} · ${totals.title}`,
    description:
      `${t.receipt.players} ${totals.players} คน · ` +
      `${t.receipt.paid} ${totals.paid} · ${t.receipt.owing} ${totals.owing} · ` +
      `${t.receipt.perHead} ${formatThb(totals.perHeadThb)}`,
  };
}

export default async function ReceiptPage({ params }: Params) {
  const { code } = await params;
  const user = await getCurrentUser();
  const data = await loadSessionReceipt(code, user?.id ?? null);
  if (!data) notFound();

  const { session, totals, charges, names } = data;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const url = `${base}/s/${session.public_code}/receipt`;
  const guestCashCount = (names ?? []).filter((n) => n.isGuest && n.paidCash).length;

  return (
    <AppShell>
      <Card focal className="px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          {t.receipt.title}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">{totals.title}</h1>
        <p className="mt-1 text-sm text-ink-500">{formatDateLong(session.starts_at)}</p>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label={t.receipt.players} value={String(totals.players)} />
          <Stat label={t.receipt.paid} value={String(totals.paid)} />
          <Stat label={t.receipt.owing} value={String(totals.owing)} />
        </div>

        {/*
          Only the per-head figure. "ยอดรวม" used to sit next to it and the two
          could contradict each other: settle_session_costs() never re-bills a
          seat that already paid, so after settling, the sum of what seats are
          charged is not the settled per-head times the number of players. Two
          money figures side by side read as a multiplication, and that one did
          not multiply. The ticket's Context table asks for four lines and a
          group total is not one of them.
        */}
        <p className="mt-4 font-display text-xl font-bold tabular-nums text-ink-900">
          {t.receipt.perHead} {formatThb(totals.perHeadThb)}
        </p>
      </Card>

      {names ? (
        <Card className="mt-4 px-5 py-4">
          <ul className="divide-y divide-ink-200">
            {names.map((n) => (
              <li key={n.participantId} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink-900">{n.displayName}</span>
                  {n.isGuest ? <Chip tone="guest">{t.receipt.guestChip}</Chip> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-ink-700">
                  {formatThb(n.amountThb)}
                  <Chip tone={n.paid ? 'success' : 'warning'}>
                    {n.paid ? t.receipt.paid : t.receipt.owing}
                  </Chip>
                </span>
              </li>
            ))}
          </ul>

          {guestCashCount > 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-clay-700">{t.receipt.guestCash}</p>
          ) : null}
        </Card>
      ) : (
        <Card className="mt-4 px-5 py-4">
          <p className="text-sm text-ink-500">{t.receipt.masked}</p>
        </Card>
      )}

      {charges.length > 0 ? (
        <Card className="mt-4 px-5 py-4">
          <h2 className="font-semibold text-ink-900">{t.receipt.extras}</h2>
          <ul className="mt-2 divide-y divide-ink-200">
            {charges.map((c) => (
              <li key={c.id} className="flex justify-between py-2 text-sm">
                <span className="text-ink-700">{c.label}</span>
                <span className="tabular-nums text-ink-900">{formatThb(c.amountThb)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mt-4">
        <ShareLink url={url} />
      </div>
    </AppShell>
  );
}
