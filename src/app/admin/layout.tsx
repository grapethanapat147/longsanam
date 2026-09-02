import type { ReactNode } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth';
import { t } from '@/i18n';

const TABS = [
  { href: '', label: t.admin.dashboard },
  { href: '/users', label: t.admin.users },
  { href: '/venues', label: t.admin.venues },
  { href: '/bookings', label: t.admin.monitoring },
  { href: '/audit', label: t.admin.auditLog },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole(['platform_admin'], '/admin');

  return (
    <AppShell>
      <PageHeader
        eyebrow="Longsanam"
        title={t.nav.admin}
        description="ภาพรวมและเครื่องมือสำหรับผู้ดูแลแพลตฟอร์ม"
      />

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-ink-200 pb-px dark:border-white/10">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={`/admin${tab.href}`}
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
