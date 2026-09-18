import type { Metadata } from 'next';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, PageHeader } from '@/components/ui/primitives';
import { CreateTournamentForm } from '@/components/tournament-forms';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t.tournaments.createTitle };

export default async function NewTournamentPage() {
  const user = await requireUser('/app/tournaments/new');
  const supabase = await createClient();

  /**
   * เฉพาะก๊วนที่ผู้ใช้เป็น **เจ้าของ** เท่านั้น เพราะ `create_tournament` เช็ค
   * `is_group_owner()` ก่อน insert ถ้าโชว์ก๊วนที่เป็นแค่สมาชิก ผู้ใช้จะกรอกจนจบ
   * แล้วไปเจอ `not_owner` ตอนกดส่ง ซึ่งเป็นการเสียเวลาที่กันได้ตั้งแต่ต้น
   */
  const { data: rows } = await supabase
    .from('group_members')
    .select('groups (id, name, archived_at)')
    .eq('user_id', user.id)
    .eq('role', 'owner');

  const ownedGroups = (rows ?? [])
    .map((r) => r.groups as unknown as { id: string; name: string; archived_at: string | null })
    .filter((g) => g !== null && g.archived_at === null)
    .map((g) => ({ id: g.id, name: g.name }));

  return (
    <AppShell>
      <PageHeader title={t.tournaments.createTitle} description={t.tournaments.createHint} />

      {ownedGroups.length === 0 ? (
        /* ฟอร์มที่ช่องเจ้าภาพว่างเปล่าคือฟอร์มที่กดแล้วพังแน่นอน บอกทางออกแทน */
        <Card className="px-5 py-5">
          <p className="font-semibold text-ink-900">{t.tournaments.needGroupTitle}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
            {t.tournaments.needGroupBody}
          </p>
          <ButtonLink href="/app/groups" className="mt-4">
            {t.tournaments.needGroupCta}
          </ButtonLink>
        </Card>
      ) : (
        <CreateTournamentForm ownedGroups={ownedGroups} />
      )}
    </AppShell>
  );
}
