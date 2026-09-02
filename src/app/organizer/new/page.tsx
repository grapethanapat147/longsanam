import type { Metadata } from 'next';
import { AppShell } from '@/components/shell';
import { PageHeader } from '@/components/ui/primitives';
import { CreateSessionWizard } from '@/components/create-session-wizard';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { loadSports } from '@/lib/queries';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t.organizer.createTitle };

export default async function NewSessionPage() {
  await requireUser('/organizer/new');
  const supabase = await createClient();

  const [sports, { data: courtRows }] = await Promise.all([
    loadSports(),
    supabase
      .from('courts')
      .select(
        'id, name, base_price_thb, capacity, is_active, venues!inner (id, name, district, is_active), court_sports (sport_id)',
      )
      .eq('is_active', true)
      .eq('venues.is_active', true)
      .order('name', { ascending: true }),
  ]);

  const courts = (courtRows ?? []).map((row) => {
    const venue = row.venues as unknown as { id: string; name: string; district: string };
    const sportIds = (row.court_sports as unknown as { sport_id: string }[]).map((s) => s.sport_id);
    return {
      id: row.id,
      name: row.name,
      basePriceThb: row.base_price_thb,
      capacity: row.capacity,
      venueId: venue.id,
      venueName: venue.name,
      district: venue.district,
      sportIds,
    };
  });

  return (
    <AppShell>
      <PageHeader
        title={t.organizer.createTitle}
        description="ตั้งค่าก๊วนให้ครบ แล้วเผยแพร่เพื่อรับลิงก์สำหรับแชร์เข้า LINE"
      />
      <CreateSessionWizard sports={sports} courts={courts} />
    </AppShell>
  );
}
