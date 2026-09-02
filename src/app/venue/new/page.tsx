import type { Metadata } from 'next';
import { AppShell } from '@/components/shell';
import { Card, PageHeader } from '@/components/ui/primitives';
import { VenueOnboardingForm } from '@/components/venue-forms';
import { requireUser } from '@/lib/auth';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t.venue.onboarding };

export default async function VenueOnboardingPage() {
  await requireUser('/venue/new');

  return (
    <AppShell>
      <PageHeader
        title={t.venue.onboarding}
        description="กรอกข้อมูลสนาม แล้วเพิ่มคอร์ตกับเวลาทำการในขั้นตอนถัดไป"
      />
      <Card className="max-w-2xl px-5 py-5">
        <VenueOnboardingForm />
      </Card>
    </AppShell>
  );
}
