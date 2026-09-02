import Link from 'next/link';
import { Card, Chip } from '@/components/ui/primitives';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatDateTime } from '@/lib/format';
import { t } from '@/i18n';

/**
 * The audit log is append-only at the database level, so this view is a
 * faithful record rather than a summary the application could have edited.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from('audit_logs')
    .select('id, actor_id, entity_type, entity_id, session_id, action, from_state, to_state, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (entity) query = query.eq('entity_type', entity);

  const [{ data: logs }, { data: profiles }] = await Promise.all([
    query,
    admin.from('profiles').select('id, display_name'),
  ]);

  const nameById = new Map(
    ((profiles ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]),
  );

  const rows = (logs ?? []) as {
    id: number;
    actor_id: string | null;
    entity_type: string;
    entity_id: string | null;
    session_id: string | null;
    action: string;
    from_state: string | null;
    to_state: string | null;
    metadata: unknown;
    created_at: string;
  }[];

  const entityTypes = [
    'session',
    'session_participant',
    'payment',
    'refund',
    'booking',
    'court_hold',
    'waitlist_entry',
    'venue',
    'profile',
  ];

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2">
        <FilterLink href="/admin/audit" active={!entity} label="ทั้งหมด" />
        {entityTypes.map((type) => (
          <FilterLink
            key={type}
            href={`/admin/audit?entity=${type}`}
            active={entity === type}
            label={type}
          />
        ))}
      </nav>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-ink-200 text-left text-xs text-ink-500 dark:border-white/10 dark:text-ink-400">
            <tr>
              <th className="px-4 py-3 font-medium">เวลา</th>
              <th className="px-4 py-3 font-medium">ผู้ทำรายการ</th>
              <th className="px-4 py-3 font-medium">เหตุการณ์</th>
              <th className="px-4 py-3 font-medium">เปลี่ยนสถานะ</th>
              <th className="px-4 py-3 font-medium">ข้อมูลเพิ่มเติม</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-white/10">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
                  {formatDateTime(row.created_at)}
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  {row.actor_id ? (nameById.get(row.actor_id) ?? 'ผู้ใช้') : 'ระบบ'}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-ink-900 dark:text-white">
                    {row.action}
                  </span>
                  <Chip tone="neutral" className="ml-2">
                    {row.entity_type}
                  </Chip>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink-500 dark:text-ink-400">
                  {row.from_state || row.to_state
                    ? `${row.from_state ?? '—'} → ${row.to_state ?? '—'}`
                    : '—'}
                </td>
                <td className="max-w-64 px-4 py-3">
                  <code className="block truncate font-mono text-xs text-ink-500 dark:text-ink-400">
                    {JSON.stringify(row.metadata)}
                  </code>
                  {row.session_id ? (
                    <Link
                      href={`/organizer/sessions/${row.session_id}`}
                      className="text-xs text-brand-700 hover:underline dark:text-brand-300"
                    >
                      ดูก๊วน →
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-500">
                  {t.common.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white focus-ring'
          : 'rounded-full border border-ink-300 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50 focus-ring dark:border-white/15 dark:text-ink-300 dark:hover:bg-white/10'
      }
    >
      {label}
    </Link>
  );
}
