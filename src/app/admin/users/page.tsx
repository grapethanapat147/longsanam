import { Card, Chip } from '@/components/ui/primitives';
import { RoleSelect } from '@/components/admin-controls';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import type { AppRole } from '@/lib/domain/types';

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  const admin = createAdminClient();

  const [{ data: profiles }, { data: contacts }, { data: participantRows }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, display_name, role, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    admin.from('profile_contacts').select('user_id, email, phone'),
    admin.from('session_participants').select('user_id, status'),
  ]);

  const contactByUser = new Map(
    ((contacts ?? []) as { user_id: string; email: string | null; phone: string | null }[]).map(
      (c) => [c.user_id, c],
    ),
  );

  const sessionsByUser = new Map<string, number>();
  for (const row of (participantRows ?? []) as { user_id: string; status: string }[]) {
    if (row.status === 'paid_confirmed') {
      sessionsByUser.set(row.user_id, (sessionsByUser.get(row.user_id) ?? 0) + 1);
    }
  }

  const users = (profiles ?? []) as {
    id: string;
    display_name: string;
    role: AppRole;
    created_at: string;
  }[];

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <thead className="border-b border-ink-200 text-left text-xs text-ink-500 dark:border-white/10 dark:text-ink-400">
          <tr>
            <th className="px-4 py-3 font-medium">ผู้ใช้</th>
            <th className="px-4 py-3 font-medium">อีเมล</th>
            <th className="px-4 py-3 font-medium">สมัครเมื่อ</th>
            <th className="px-4 py-3 text-right font-medium">ก๊วนที่เล่น</th>
            <th className="px-4 py-3 text-right font-medium">สิทธิ์</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200 dark:divide-white/10">
          {users.map((user) => (
            <tr key={user.id}>
              <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">
                {user.display_name}
                {user.id === me?.id ? (
                  <Chip tone="brand" className="ml-2">
                    คุณ
                  </Chip>
                ) : null}
              </td>
              <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                {contactByUser.get(user.id)?.email ?? '—'}
              </td>
              <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                {formatDate(user.created_at)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-ink-700 dark:text-ink-200">
                {sessionsByUser.get(user.id) ?? 0}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end">
                  <RoleSelect userId={user.id} role={user.role} isSelf={user.id === me?.id} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
