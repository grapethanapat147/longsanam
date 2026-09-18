import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { SessionStatusChip } from '@/components/status';
import { Alert, ButtonLink, Card, Chip, EmptyState, PageHeader } from '@/components/ui/primitives';
import { GroupControls } from '@/components/group-forms';
import { ImpressionSummaryCard } from '@/components/impression-forms';
import { ShareLink } from '@/components/share-link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { formatDate, groupShareUrl } from '@/lib/format';
import { t } from '@/i18n';
import type { SessionStatus } from '@/lib/domain/types';

export const metadata: Metadata = { title: t.groups.title };

type Params = { params: Promise<{ id: string }> };

export default async function GroupPage({ params }: Params) {
  const { id } = await params;
  const user = await requireUser(`/app/groups/${id}`);
  const supabase = await createClient();

  const { data: group } = await supabase
    .from('groups')
    .select('id, name, public_code, home_district, archived_at, sports (name_th, emoji)')
    .eq('id', id)
    .maybeSingle();

  // RLS ตัดคนนอกออกไปแล้ว ถ้าอ่านไม่เจอแปลว่าไม่มีสิทธิ์ หรือไม่มีจริง
  //
  // ตอบข้อความเดียวกันทั้งสองกรณี เพื่อไม่บอกคนนอกว่าก๊วนนี้มีอยู่จริงหรือไม่
  // และไม่ใช้ notFound() เพราะโปรเจกต์ยังไม่มี not-found boundary ผลคือหน้าว่าง
  // เปล่าซึ่งอ่านไม่ออกว่าเกิดอะไรขึ้น
  if (!group) {
    return (
      <AppShell>
        <PageHeader title={t.groups.title} />
        <EmptyState title={t.groups.notFoundOrNotMember} />
      </AppShell>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: impression } = await (supabase.rpc as any)('group_impression_summary', {
    p_group_id: id,
  });

  const { data: members } = await supabase
    .from('group_members')
    .select('user_id, role, profiles (display_name)')
    .eq('group_id', id)
    .order('role');

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, public_code, title, starts_at, status')
    .eq('group_id', id)
    .order('starts_at', { ascending: false })
    .limit(20);

  const me = (members ?? []).find((m) => m.user_id === user.id);
  const isOwner = me?.role === 'owner';

  return (
    <AppShell>
      <PageHeader
        title={`${group.sports?.emoji ?? ''} ${group.name}`.trim()}
        description={[group.sports?.name_th, group.home_district].filter(Boolean).join(' · ')}
      />

      {group.archived_at ? <Alert tone="warning">{t.groups.archived}</Alert> : null}

      {/* ค่าเฉลี่ยคำนวณสดจากสมาชิกปัจจุบัน ไม่ได้เก็บเป็นคอลัมน์ (LSN-0039) */}
      <div className="mb-4">
        <ImpressionSummaryCard title={t.impressions.title} summary={impression ?? null} />
      </div>

      <Card className="px-5 py-4">
        <p className="font-medium text-ink-800">
          {t.groups.members} · {(members ?? []).length}
        </p>
        <ul className="mt-2 divide-y divide-ink-200">
          {(members ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                {m.profiles?.display_name ?? 'ผู้เล่น'}
              </span>
              {m.role === 'owner' ? <Chip tone="success">{t.groups.owner}</Chip> : null}
            </li>
          ))}
        </ul>
      </Card>

      {group.archived_at || !group.public_code ? null : (
        <div className="mt-4">
          <ShareLink
            url={groupShareUrl(group.public_code)}
            title={t.groups.invite}
            hint={t.groups.inviteHint}
            inputLabel={t.groups.invite}
          />
        </div>
      )}

      <Card className="mt-4 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-ink-800">{t.groups.sessions}</p>
          {group.archived_at ? null : (
            <ButtonLink href={`/organizer/new?groupId=${group.id}`}>
              {t.groups.newSession}
            </ButtonLink>
          )}
        </div>
        {(sessions ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">{t.groups.noSessions}</p>
        ) : (
          <ul className="mt-2 divide-y divide-ink-200">
            {(sessions ?? []).map((s) => (
              <li key={s.id} className="py-2">
                <Link href={`/s/${s.public_code}`} className="focus-ring block rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-900">{s.title}</span>
                    <SessionStatusChip status={s.status as SessionStatus} />
                  </div>
                  <p className="text-xs text-ink-500">{formatDate(s.starts_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-4">
        <GroupControls
          groupId={group.id}
          isOwner={isOwner}
          archived={group.archived_at !== null}
        />
      </div>
    </AppShell>
  );
}
