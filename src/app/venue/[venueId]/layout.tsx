import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { Chip, PageHeader } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { requireVenueMembership } from '@/lib/auth';
import { t } from '@/i18n';

const TABS = [
  { href: '', label: 'ภาพรวม' },
  { href: '/courts', label: t.venue.courts },
  { href: '/calendar', label: t.venue.calendar },
  { href: '/inbox', label: t.venue.inbox },
  { href: '/history', label: t.venue.history },
  { href: '/revenue', label: t.venue.revenue },
];

export default async function VenueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  await requireVenueMembership(venueId);

  const supabase = await createClient();
  const { data: venue } = await supabase
    .from('venues')
    .select('id, name, district, province, is_active')
    .eq('id', venueId)
    .maybeSingle();

  if (!venue) notFound();

  return (
    <AppShell>
      <PageHeader
        eyebrow={t.venue.portal}
        title={venue.name}
        description={`${venue.district} · ${venue.province}`}
        action={
          <Chip tone={venue.is_active ? 'success' : 'neutral'}>
            {venue.is_active ? 'เปิดให้บริการ' : 'ปิดชั่วคราว'}
          </Chip>
        }
      />

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-ink-200 pb-px dark:border-white/10">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={`/venue/${venueId}${tab.href}`}
            className="whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 focus-ring dark:text-ink-300 dark:hover:bg-white/10"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </AppShell>
  );
}
