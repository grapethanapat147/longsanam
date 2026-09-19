import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, Chip, EmptyState, PageHeader } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { formatDate, formatThb } from '@/lib/format';
import { t } from '@/i18n';
import { tierLabel } from '@/lib/domain/tiers';

export const metadata: Metadata = { title: t.tournaments.title };

export default async function TournamentsPage() {
  await requireUser('/app/tournaments');
  const supabase = await createClient();

  // RLS คืนเฉพาะงานที่ผู้ใช้เกี่ยวข้อง คือเป็นเจ้าภาพหรืออยู่ในทีมที่สมัคร
  const { data: rows } = await supabase
    .from('tournaments')
    .select('id, title, tier, status, starts_at, entry_fee_thb, min_teams, groups (name)')
    .order('starts_at', { ascending: true });

  const tournaments = rows ?? [];

  return (
    <AppShell>
      <PageHeader
        title={t.tournaments.title}
        description={t.tournaments.tierNote}
        action={<ButtonLink href="/app/tournaments/new">{t.tournaments.create}</ButtonLink>}
      />

      {tournaments.length === 0 ? (
        /* ข้อความว่างเดิมบอกให้ "สร้างของก๊วนคุณเอง" แต่ไม่มีปุ่มให้กด (LSN-0032) */
        <EmptyState
          title={t.tournaments.empty}
          action={<ButtonLink href="/app/tournaments/new">{t.tournaments.create}</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-3">
          {tournaments.map((x) => (
            <li key={x.id}>
              <Link href={`/app/tournaments/${x.id}`} className="block focus-ring rounded-card">
                <Card className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate font-medium text-ink-900">{x.title}</p>
                    <Chip tone={x.status === 'ready' ? 'success' : 'neutral'}>{tierLabel(x.tier)}</Chip>
                  </div>
                  <p className="mt-1 text-sm text-ink-500">
                    {formatDate(x.starts_at)} · {formatThb(x.entry_fee_thb)} ต่อก๊วน ·{' '}
                    {t.tournaments.gateTeams} {x.min_teams}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
