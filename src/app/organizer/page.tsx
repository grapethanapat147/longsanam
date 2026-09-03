import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/shell';
import { SessionStatusChip } from '@/components/status';
import { ButtonLink, Card, Chip, EmptyState, PageHeader } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { loadSessionCounts } from '@/lib/queries';
import { formatDate, formatThb, formatTimeRange } from '@/lib/format';
import { t } from '@/i18n';
import type { SessionStatus } from '@/lib/domain/types';

export const metadata: Metadata = { title: t.organizer.dashboard };

export default async function OrganizerPage() {
  const user = await requireUser('/organizer');
  const supabase = await createClient();

  const { data } = await supabase
    .from('sessions')
    .select(
      'id, public_code, title, starts_at, ends_at, area_text, status, target_players, min_players, budget_per_person_thb, sports (name_th, emoji)',
    )
    .eq('organizer_id', user.id)
    .order('starts_at', { ascending: false });

  const sessions = (data ?? []) as unknown as {
    id: string;
    public_code: string;
    title: string;
    starts_at: string;
    ends_at: string;
    area_text: string;
    status: SessionStatus;
    target_players: number;
    min_players: number;
    budget_per_person_thb: number;
    sports: { name_th: string; emoji: string } | null;
  }[];

  const counts = await loadSessionCounts(sessions.map((s) => s.id));

  return (
    <AppShell>
      <PageHeader
        title={t.organizer.dashboard}
        description="ก๊วนทั้งหมดที่คุณเป็นผู้จัด"
        action={<ButtonLink href="/organizer/new">{t.organizer.createTitle}</ButtonLink>}
      />

      {sessions.length === 0 ? (
        <EmptyState
          icon="📋"
          title="คุณยังไม่ได้สร้างก๊วน"
          description="สร้างก๊วนแรกของคุณ แล้วแชร์ลิงก์เข้ากลุ่ม LINE ได้เลย"
          action={<ButtonLink href="/organizer/new">{t.organizer.createTitle}</ButtonLink>}
        />
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const count = counts.get(session.id);
            return (
              <Card key={session.id}>
                <Link
                  href={`/organizer/sessions/${session.id}`}
                  className="block rounded-card px-4 py-3 focus-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">
                        <span aria-hidden>{session.sports?.emoji} </span>
                        {session.title}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {formatDate(session.starts_at)} ·{' '}
                        {formatTimeRange(session.starts_at, session.ends_at)} · {session.area_text}
                      </p>
                    </div>
                    <SessionStatusChip status={session.status} />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Chip tone="success">ชำระแล้ว {count?.paid ?? 0}</Chip>
                    <Chip tone="warning">รอชำระ {count?.pending ?? 0}</Chip>
                    <Chip tone="neutral">
                      ขั้นต่ำ {session.min_players} · เป้าหมาย {session.target_players}
                    </Chip>
                    <Chip tone="brand">{formatThb(session.budget_per_person_thb)}/คน</Chip>
                    {count && count.waitlisted > 0 ? (
                      <Chip tone="info">สำรอง {count.waitlisted}</Chip>
                    ) : null}
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
