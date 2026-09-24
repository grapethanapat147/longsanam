import Image from 'next/image';
import { Card } from '@/components/ui/primitives';
import { BADGES, BADGE_ICON } from '@/lib/domain/badges';
import { t } from '@/i18n';

/**
 * ตารางสะสม badge (LSN-0028)
 *
 * แสดง **ทุกใบเสมอ** ไม่ใช่เฉพาะใบที่ได้ — ใบที่ยังไม่ได้เป็นเงาจางพร้อมบอกว่า
 * ต้องทำอะไรถึงจะได้ ตั๋วกำหนดว่าห้ามมีใบที่เงียบโดยไม่บอกทาง
 *
 * ไอคอน 64px ตามที่ตั๋วกำหนด — เคยลองที่ 48px แล้วรายละเอียดในลายหาย
 * (`badge-48px-check.png` ในโฟลเดอร์ artwork คือหลักฐานรอบนั้น)
 */
export function BadgeGrid({
  earned,
  title = t.badges.title,
}: {
  earned: { badge_id: string; awarded_at: string }[];
  title?: string;
}) {
  const earnedIds = new Set(earned.map((b) => b.badge_id));

  return (
    <Card className="px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-ink-900">{title}</h2>
        <span className="text-sm tabular-nums text-ink-500">
          {earnedIds.size}/{BADGES.length}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">{t.badges.note}</p>

      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {BADGES.map((badge) => {
          const has = earnedIds.has(badge.id);
          return (
            <li key={badge.id} className="flex flex-col items-center text-center">
              <Image
                src={BADGE_ICON(badge.id)}
                alt=""
                width={64}
                height={64}
                aria-hidden
                className={has ? '' : 'opacity-25 grayscale'}
              />
              <p
                className={`mt-2 text-sm font-medium ${has ? 'text-ink-900' : 'text-ink-500'}`}
              >
                {badge.name}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                {has ? badge.description : badge.hint}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * แถบ badge ที่ได้จากงานนี้ (LSN-0028)
 *
 * ต่างจาก `BadgeGrid` ตรงที่ **โชว์เฉพาะใบที่ได้** ไม่โชว์ใบที่ยังไม่ได้
 * หน้าทัวร์นาเมนต์กำลังบอกว่า "จบงานนี้แล้วคุณได้อะไร" ไม่ใช่ "คุณยังขาดอะไร"
 * การเอาตารางสะสมทั้งใบมาวางตรงนี้จะกลายเป็นรายการสิ่งที่ยังทำไม่ได้
 * บนหน้าที่ควรเป็นข่าวดี
 */
export function BadgesEarnedHere({ earned }: { earned: { badge_id: string }[] }) {
  const badges = earned
    .map((row) => BADGES.find((b) => b.id === row.badge_id))
    .filter((b): b is (typeof BADGES)[number] => b !== undefined);

  if (badges.length === 0) {
    return null;
  }

  return (
    <Card className="px-5 py-4">
      <p className="font-medium text-ink-800">{t.tournaments.badgesEarnedHere}</p>
      <ul className="mt-3 flex flex-wrap gap-5">
        {badges.map((badge) => (
          <li key={badge.id} className="flex w-24 flex-col items-center text-center">
            <Image src={BADGE_ICON(badge.id)} alt="" width={64} height={64} aria-hidden />
            <p className="mt-1.5 text-sm font-medium text-ink-900">{badge.name}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
