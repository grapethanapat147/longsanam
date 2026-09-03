import { Card, Stat } from '@/components/ui/primitives';
import { SessionStatusChip } from '@/components/status';
import { MaintenanceButton } from '@/components/admin-controls';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatThb } from '@/lib/format';
import { sessionStatusLabel } from '@/i18n';
import type { SessionStatus } from '@/lib/domain/types';

export default async function AdminDashboardPage() {
  const admin = createAdminClient();

  const [
    { count: users },
    { count: venues },
    { count: courts },
    { data: sessions },
    { data: payments },
    { data: refunds },
    { count: pendingBookings },
    { count: activeHolds },
  ] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('venues').select('id', { count: 'exact', head: true }),
    admin.from('courts').select('id', { count: 'exact', head: true }),
    admin.from('sessions').select('status'),
    admin.from('payments').select('amount_thb, status'),
    admin.from('refunds').select('amount_thb, status'),
    admin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .in('status', ['requested', 'held']),
    admin.from('court_holds').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);

  const statusCounts = new Map<SessionStatus, number>();
  for (const row of (sessions ?? []) as { status: SessionStatus }[]) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }

  const paidTotal = ((payments ?? []) as { amount_thb: number; status: string }[])
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount_thb, 0);

  const refundedTotal = ((refunds ?? []) as { amount_thb: number; status: string }[])
    .filter((r) => r.status === 'completed')
    .reduce((sum, r) => sum + r.amount_thb, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="ผู้ใช้" value={`${users ?? 0}`} />
        <Stat label="สนาม" value={`${venues ?? 0}`} hint={`${courts ?? 0} คอร์ต`} />
        <Stat label="เงินที่เก็บได้" value={formatThb(paidTotal)} tone="positive" />
        <Stat label="เงินที่คืนไป" value={formatThb(refundedTotal)} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="คำขอจองที่ค้าง"
          value={`${pendingBookings ?? 0}`}
          tone={(pendingBookings ?? 0) > 0 ? 'negative' : 'default'}
        />
        <Stat label="การกันคอร์ตที่ยังทำงาน" value={`${activeHolds ?? 0}`} />
        <Stat label="ก๊วนทั้งหมด" value={`${sessions?.length ?? 0}`} />
        <Stat label="รายได้สุทธิ" value={formatThb(paidTotal - refundedTotal)} tone="positive" />
      </div>

      <Card className="px-5 py-4">
        <h2 className="font-semibold text-ink-900">ก๊วนแยกตามสถานะ</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(sessionStatusLabel) as SessionStatus[]).map((status) => (
            <li
              key={status}
              className="flex items-center justify-between rounded-xl border border-ink-200 px-3 py-2"
            >
              <SessionStatusChip status={status} />
              <span className="font-bold tabular-nums text-ink-900">
                {statusCounts.get(status) ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="px-5 py-4">
        <h2 className="font-semibold text-ink-900">งานบำรุงรักษา</h2>
        <p className="mt-1 text-sm text-ink-600">
          ปล่อยคอร์ตที่กันไว้เกินเวลา ปิดรายการชำระเงินที่หมดอายุ และคืนสิทธิ์คิวสำรองที่ไม่ได้ใช้
          ปกติงานเหล่านี้รันตามกำหนดเวลาผ่าน{' '}
          <code className="font-mono text-xs">/api/cron/expire</code>
        </p>
        <div className="mt-3">
          <MaintenanceButton />
        </div>
      </Card>
    </div>
  );
}
