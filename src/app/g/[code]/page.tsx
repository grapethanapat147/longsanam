import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { Alert, ButtonLink, Card, PageHeader } from '@/components/ui/primitives';
import { JoinGroupButton } from '@/components/group-forms';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { t } from '@/i18n';

export const metadata: Metadata = { title: t.groups.joinTitle };

type Params = { params: Promise<{ code: string }> };

type Invite = {
  name: string;
  sportSlug: string | null;
  memberCount: number;
  archived: boolean;
};

/**
 * หน้ารับเชิญเข้าก๊วน — เปิดได้โดยไม่ต้องล็อกอิน
 *
 * ข้อมูลมาจาก RPC `group_invite_public` ไม่ใช่การอ่านตาราง `groups` ตรง ๆ
 * เพราะ RLS เป็น row-level ไม่ใช่ column-level — ถ้าเปิด policy ให้คนนอกอ่านแถว
 * ได้ มันจะเปิดทั้งแถว RPC จึงคืนเฉพาะสามอย่างที่หน้านี้ต้องใช้จริง
 * และไม่คืนรายชื่อสมาชิกออกมาเลย (บทเรียนจาก LSN-0023)
 */
export default async function GroupInvitePage({ params }: Params) {
  const { code } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.rpc as any)('group_invite_public', { p_code: code });
  const invite = (data ?? null) as Invite | null;

  if (!invite) notFound();

  return (
    <AppShell>
      <PageHeader
        title={invite.name}
        description={t.groups.memberCount(invite.memberCount)}
      />

      {invite.archived ? (
        <Alert tone="warning">{t.groups.archived}</Alert>
      ) : (
        <Card className="px-5 py-5">
          <p className="text-sm text-ink-700">{t.groups.joinTitle}</p>
          <div className="mt-4">
            {user ? (
              <JoinGroupButton code={code} />
            ) : (
              <>
                <p className="mb-3 text-sm text-ink-500">{t.groups.joinSignInFirst}</p>
                <ButtonLink href={`/auth/sign-in?next=/g/${code}`}>{t.auth.signInTitle}</ButtonLink>
              </>
            )}
          </div>
        </Card>
      )}
    </AppShell>
  );
}
