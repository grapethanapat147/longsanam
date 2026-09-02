import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { Alert, ButtonLink, Card, Chip, EmptyState, PageHeader } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t.nav.venue };

export default async function VenueListPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser('/venue');
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from('venue_members')
    .select('role, venues (id, name, district, is_active, auto_confirm_bookings)')
    .eq('user_id', user.id);

  const memberships = (data ?? []) as unknown as {
    role: string;
    venues: {
      id: string;
      name: string;
      district: string;
      is_active: boolean;
      auto_confirm_bookings: boolean;
    } | null;
  }[];

  return (
    <AppShell>
      <PageHeader
        title={t.venue.portal}
        description="จัดการสนาม คอร์ต เวลาทำการ และคำขอจอง"
        action={<ButtonLink href="/venue/new">{t.venue.onboarding}</ButtonLink>}
      />

      {error === 'forbidden' ? (
        <div className="mb-4">
          <Alert tone="danger">คุณไม่ได้เป็นผู้ดูแลของสนามนั้น</Alert>
        </div>
      ) : null}

      {memberships.length === 0 ? (
        <EmptyState
          icon="🏟️"
          title="คุณยังไม่ได้ดูแลสนามใด"
          description="ลงทะเบียนสนามของคุณเพื่อเริ่มรับคำขอจองจากก๊วนในระบบ"
          action={<ButtonLink href="/venue/new">{t.venue.onboarding}</ButtonLink>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {memberships.map((membership) =>
            membership.venues ? (
              <Card key={membership.venues.id}>
                <Link
                  href={`/venue/${membership.venues.id}`}
                  className="block rounded-card px-5 py-4 focus-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-ink-900 dark:text-white">
                      {membership.venues.name}
                    </h2>
                    <Chip tone={membership.venues.is_active ? 'success' : 'neutral'}>
                      {membership.venues.is_active ? 'เปิดให้บริการ' : 'ปิดชั่วคราว'}
                    </Chip>
                  </div>
                  <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                    {membership.venues.district}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Chip tone="neutral">{membership.role}</Chip>
                    <Chip tone={membership.venues.auto_confirm_bookings ? 'info' : 'warning'}>
                      {membership.venues.auto_confirm_bookings
                        ? 'ยืนยันอัตโนมัติ'
                        : 'ต้องอนุมัติเอง'}
                    </Chip>
                  </div>
                </Link>
              </Card>
            ) : null,
          )}
        </div>
      )}
    </AppShell>
  );
}
