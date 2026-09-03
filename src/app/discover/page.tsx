import type { Metadata } from 'next';
import Link from 'next/link';
import { t } from '@/i18n';
import { loadDiscoverSessions, loadSports } from '@/lib/queries';
import { AppShell } from '@/components/shell';
import { SessionCardLink } from '@/components/session-card';
import { EmptyState, PageHeader, ButtonLink } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: t.nav.discover };

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const { sport } = await searchParams;
  const [{ sessions, counts }, sports] = await Promise.all([
    loadDiscoverSessions({ sport }),
    loadSports(),
  ]);

  return (
    <AppShell>
      <PageHeader
        title={t.nav.discover}
        description="ก๊วนที่กำลังเปิดรับผู้เล่นในช่วงนี้"
        action={<ButtonLink href="/organizer/new">{t.nav.create}</ButtonLink>}
      />

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="กรองตามกีฬา">
        <FilterChip href="/discover" active={!sport} label="ทั้งหมด" />
        {sports.map((s) => (
          <FilterChip
            key={s.id}
            href={`/discover?sport=${s.slug}`}
            active={sport === s.slug}
            label={`${s.emoji} ${s.name_th}`}
          />
        ))}
      </nav>

      {sessions.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={t.session.noSessions}
          description="ลองเปลี่ยนกีฬาที่กรอง หรือเริ่มตั้งก๊วนของคุณเอง แล้วชวนเพื่อนเข้ามา"
          action={<ButtonLink href="/organizer/new">{t.nav.create}</ButtonLink>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <SessionCardLink key={session.id} session={session} counts={counts.get(session.id)} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full px-3 py-1.5 text-sm font-medium transition focus-ring',
        active
          ? 'bg-brand-600 text-white'
          : 'border border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      {label}
    </Link>
  );
}
