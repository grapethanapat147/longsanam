import type { Metadata } from 'next';
import { AppShell } from '@/components/shell';
import { ProfileForm } from '@/components/profile-form';
import { Card, Chip, PageHeader } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { isLineLoginConfigured, isLiffConfigured } from '@/lib/line';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t.nav.profile };

const ROLE_LABEL: Record<string, string> = {
  player: 'ผู้เล่น',
  venue_admin: 'เจ้าของสนาม',
  platform_admin: 'ผู้ดูแลระบบ',
};

export default async function ProfilePage() {
  const user = await requireUser('/app/profile');
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from('profile_contacts')
    .select('phone, line_user_id, email')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <AppShell>
      <PageHeader title={t.nav.profile} description="ข้อมูลที่แสดงให้เพื่อนร่วมก๊วนเห็น" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="px-5 py-5">
          <ProfileForm
            displayName={user.displayName}
            phone={contact?.phone ?? ''}
            email={user.email ?? contact?.email ?? ''}
          />
        </Card>

        <div className="space-y-4">
          <Card className="px-5 py-5">
            <h2 className="font-semibold text-ink-900 dark:text-white">สิทธิ์การใช้งาน</h2>
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
              <Chip tone="brand">{ROLE_LABEL[user.role] ?? user.role}</Chip>
            </p>
            <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">
              ทุกบัญชีสามารถเป็นผู้จัดก๊วนได้เอง สิทธิ์เจ้าของสนามจะได้รับอัตโนมัติเมื่อคุณลงทะเบียนสนาม
            </p>
          </Card>

          <Card className="px-5 py-5">
            <h2 className="font-semibold text-ink-900 dark:text-white">การเชื่อมต่อ LINE</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-600 dark:text-ink-300">LINE Login</dt>
                <dd>
                  {isLineLoginConfigured() ? (
                    <Chip tone="success">พร้อมใช้งาน</Chip>
                  ) : (
                    <Chip tone="neutral">ยังไม่ได้ตั้งค่า</Chip>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-600 dark:text-ink-300">LIFF</dt>
                <dd>
                  {isLiffConfigured() ? (
                    <Chip tone="success">พร้อมใช้งาน</Chip>
                  ) : (
                    <Chip tone="neutral">ยังไม่ได้ตั้งค่า</Chip>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-600 dark:text-ink-300">LINE user ID</dt>
                <dd className="font-mono text-xs text-ink-500 dark:text-ink-400">
                  {contact?.line_user_id ?? '—'}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
              ระหว่างการพัฒนาใช้อีเมลเข้าสู่ระบบได้ตามปกติ เมื่อตั้งค่า LINE channel
              แล้วปุ่มเข้าสู่ระบบด้วย LINE จะเปิดใช้งานเอง
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
