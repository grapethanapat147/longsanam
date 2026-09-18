import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { Card, Chip, EmptyState, PageHeader } from '@/components/ui/primitives';
import { CreateGroupForm } from '@/components/group-forms';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { loadSports } from '@/lib/queries';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t.groups.title };

export default async function MyGroupsPage() {
  const user = await requireUser('/app/groups');
  const supabase = await createClient();

  // กีฬาต้องอ่านผ่าน loadSports() เสมอ เพราะมันเป็นที่เดียวที่กรอง is_active
  // หน้านี้เคยยิง query ตาราง sports เอง จึงยังโชว์กีฬาที่ปิดไปแล้วอยู่ (LSN-0033)
  const [{ data: rows }, sports] = await Promise.all([
    supabase
      .from('group_members')
      .select('role, groups (id, name, home_district, archived_at, sports (name_th, emoji))')
      .eq('user_id', user.id),
    loadSports(),
  ]);

  const groups = (rows ?? []).filter((r) => r.groups !== null);

  return (
    <AppShell>
      <PageHeader title={t.groups.title} description={t.groups.inviteHint} />

      {groups.length === 0 ? (
        <EmptyState title={t.groups.empty} />
      ) : (
        <ul className="grid gap-3">
          {groups.map((row) => {
            const g = row.groups!;
            return (
              <li key={g.id}>
                <Link href={`/app/groups/${g.id}`} className="block focus-ring rounded-card">
                  <Card className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate font-medium text-ink-900">
                        {g.sports?.emoji} {g.name}
                      </p>
                      <Chip tone={row.role === 'owner' ? 'success' : 'neutral'}>
                        {row.role === 'owner' ? t.groups.owner : t.groups.member}
                      </Chip>
                    </div>
                    <p className="mt-1 text-sm text-ink-500">
                      {g.sports?.name_th}
                      {g.home_district ? ` · ${g.home_district}` : ''}
                      {g.archived_at ? ` · ${t.groups.archived}` : ''}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6">
        <CreateGroupForm sports={sports} />
      </div>
    </AppShell>
  );
}
