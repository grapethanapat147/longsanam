import { formatDateTime } from '@/lib/format';
import { Chip, type ChipTone } from '@/components/ui/primitives';

type Entry = {
  id: number;
  action: string;
  from_state: string | null;
  to_state: string | null;
  metadata: unknown;
  created_at: string;
};

/**
 * The audit log rendered as a human timeline. This is read straight from
 * `audit_logs`, so what the organizer sees is exactly what was recorded — not
 * a separate, prettier story told by the UI.
 */
const ACTION_LABEL: Record<string, string> = {
  'session.published': 'เผยแพร่ก๊วน',
  'session.ready_to_book': 'ครบเงื่อนไข พร้อมจองสนาม',
  'session.holding_court': 'เริ่มกันคอร์ต',
  'session.booked': 'ได้สนามแล้ว',
  'session.booking_failed': 'จองสนามไม่สำเร็จ',
  'session.cancelled': 'ยกเลิกก๊วน',
  'participant.joined': 'ผู้เล่นเข้าร่วม',
  'participant.confirmed': 'ผู้เล่นชำระเงินแล้ว',
  'participant.cancelled': 'ผู้เล่นยกเลิก',
  'payment.created': 'สร้างรายการชำระเงิน',
  'payment.paid': 'ชำระเงินสำเร็จ',
  'payment.failed': 'ชำระเงินไม่สำเร็จ',
  'payment.expired': 'หมดเวลาชำระเงิน',
  'refund.created': 'สร้างรายการคืนเงิน',
  'refund.completed': 'คืนเงินสำเร็จ',
  'refund.failed': 'คืนเงินไม่สำเร็จ',
  'hold.created': 'กันคอร์ตไว้',
  'hold.released': 'ปล่อยคอร์ต',
  'hold.expired': 'การกันคอร์ตหมดอายุ',
  'hold.rejected': 'กันคอร์ตไม่สำเร็จ',
  'booking.requested': 'ส่งคำขอจองไปยังสนาม',
  'booking.confirmed': 'สนามยืนยันการจอง',
  'booking.rejected': 'สนามปฏิเสธคำขอ',
  'booking.expired': 'คำขอจองหมดอายุ',
  'waitlist.joined': 'เข้าคิวสำรอง',
  'waitlist.promoted': 'เลื่อนขึ้นจากคิวสำรอง',
  'waitlist.promotion_expired': 'หมดเวลารับสิทธิ์จากคิวสำรอง',
  'waitlist.left': 'ออกจากคิวสำรอง',
  'preference.approved': 'อนุมัติสนามสำรอง',
  'preference.unapproved': 'ยกเลิกการอนุมัติสนาม',
};

function toneFor(action: string): ChipTone {
  if (action.endsWith('.failed') || action.endsWith('.rejected') || action.includes('booking_failed')) {
    return 'danger';
  }
  if (action.endsWith('.expired')) return 'neutral';
  if (action.endsWith('.confirmed') || action.endsWith('.paid') || action.endsWith('.booked')) {
    return 'success';
  }
  if (action.startsWith('hold.') || action.endsWith('.requested')) return 'warning';
  return 'info';
}

export function SessionTimeline({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return <p className="mt-2 text-sm text-ink-500">ยังไม่มีบันทึกเหตุการณ์</p>;
  }

  return (
    <ol className="mt-3 space-y-3">
      {entries.map((entry) => {
        const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
        const detail =
          typeof metadata.reason === 'string'
            ? metadata.reason
            : typeof metadata.priceThb === 'number'
              ? `${metadata.priceThb} บาท`
              : null;

        return (
          <li key={entry.id} className="flex gap-3">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink-300 dark:bg-white/25" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={toneFor(entry.action)}>
                  {ACTION_LABEL[entry.action] ?? entry.action}
                </Chip>
                {entry.from_state && entry.to_state ? (
                  <span className="font-mono text-xs text-ink-400">
                    {entry.from_state} → {entry.to_state}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                {formatDateTime(entry.created_at)}
                {detail ? ` · ${detail}` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
