import type { Metadata } from 'next';
import { AppShell } from '@/components/shell';
import { ButtonLink, Card, PageHeader } from '@/components/ui/primitives';
import { CreateTournamentForm } from '@/components/tournament-forms';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t.tournaments.createTitle };

export default async function NewTournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
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

  /**
   * ค่าตั้งต้นจากงานเดิม (LSN-0038)
   *
   * RLS คืนงานนี้เฉพาะคนที่เกี่ยวข้องอยู่แล้ว ถ้าอ่านไม่ได้ก็ตกกลับเป็นฟอร์มเปล่า
   * แทนที่จะระเบิด — ลิงก์ที่ถูกส่งต่อไปให้คนอื่นจึงไม่ทำให้หน้าพัง
   *
   * **ไม่คัดลอกวันเวลา** วันของงานเก่าอยู่ในอดีต ถ้าเติมมาให้จะได้ฟอร์มที่ผิดกติกา
   * ตั้งแต่ยังไม่ทันแตะ แล้วผู้ใช้ต้องมานั่งหาว่าผิดตรงไหน
   */
  const { data: source } = from
    ? await supabase
        .from('tournaments')
        .select('host_group_id, title, tier, entry_fee_thb, min_teams, max_teams')
        .eq('id', from)
        .maybeSingle()
    : { data: null };

  const initial =
    source && ownedGroups.some((g) => g.id === source.host_group_id)
      ? {
          hostGroupId: source.host_group_id,
          title: source.title,
          tier: source.tier as string,
          entryFeeThb: source.entry_fee_thb,
          minTeams: source.min_teams,
          maxTeams: source.max_teams,
        }
      : null;

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
        <CreateTournamentForm ownedGroups={ownedGroups} initial={initial} />
      )}
    </AppShell>
  );
}
