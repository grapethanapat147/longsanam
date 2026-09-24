/**
 * รายการ badge ทั้งหกใบ (LSN-0028)
 *
 * คัดลอกมาจาก `docs/design/social-tournament/badges/badge-definitions.json`
 * ซึ่งเป็นของที่มาพร้อม artwork **ไม่มีตาราง catalog ในฐานข้อมูล** เพราะรายการนี้
 * เปลี่ยนพร้อมโค้ดเสมอ (ไอคอนอยู่ใน `public/` และเงื่อนไขอยู่ใน SQL)
 * การมีตารางจะสร้างของที่ต้อง seed ให้ตรงกับโค้ดโดยไม่ได้อะไรกลับมา
 *
 * `hint` คือสิ่งที่หน้าจอบอกกับใบที่ยังไม่ได้ — ตั๋วกำหนดว่าห้ามมีใบที่เงียบ
 * โดยไม่บอกว่าต้องทำอะไรถึงจะได้
 *
 * ⚠️ เงื่อนไขจริงอยู่ใน `recompute_player_badges()` ข้อความตรงนี้ต้องตามให้ตรง
 * มีเทสเทียบรายการกับ `badge-definitions.json` และกับกติกาใน migration
 */

export type BadgeRarity = 'common' | 'rare' | 'elite';

export type BadgeDefinition = {
  id: string;
  rarity: BadgeRarity;
  name: string;
  description: string;
  /** บอกว่าต้องทำอะไรถึงจะได้ สำหรับใบที่ยังไม่ได้ */
  hint: string;
};

export const BADGES: readonly BadgeDefinition[] = [
  {
    id: '01-first-tournament',
    rarity: 'rare',
    name: 'ทัวร์นาเมนต์แรก',
    description: 'ลงแข่งจนจบทัวร์นาเมนต์แรกของคุณ',
    hint: 'ลงสนามในทัวร์นาเมนต์ให้จบสักรายการ — สมัครอย่างเดียวยังไม่นับ',
  },
  {
    id: '02-new-opponents',
    rarity: 'common',
    name: 'คู่แข่งใหม่',
    description: 'จบแมตช์กับก๊วนที่ไม่เคยแข่งด้วยกัน',
    hint: 'ลงแข่งกับก๊วนอื่นสักแมตช์ แล้วให้อีกฝั่งยืนยันผล',
  },
  {
    id: '03-five-tournaments',
    rarity: 'rare',
    name: 'ขยับอีกขั้น',
    description: 'ลงแข่งครบ 5 ทัวร์นาเมนต์',
    hint: 'ลงสนามให้ครบห้ารายการที่แข่งจบแล้ว',
  },
  {
    id: '04-champion',
    rarity: 'elite',
    name: 'แชมป์ประจำรายการ',
    description: 'คว้าอันดับหนึ่งในทัวร์นาเมนต์',
    hint: 'ชนะเป็นอันดับหนึ่งในรายการที่มีอย่างน้อยสี่ก๊วน',
  },
  {
    id: '05-fair-play',
    rarity: 'common',
    name: 'น้ำใจนักกีฬา',
    description: 'ได้รับคำชื่นชมเรื่องน้ำใจนักกีฬาหลังแข่ง',
    hint: 'ให้คู่แข่งจากก๊วนอื่นให้คะแนนมารยาทคุณตั้งแต่ 4 ขึ้นไป',
  },
  {
    id: '06-three-squads',
    rarity: 'rare',
    name: 'เพื่อนร่วมสนาม',
    description: 'แข่งกับก๊วนต่างกันครบ 3 ก๊วน',
    hint: 'ลงแข่งกับก๊วนที่ต่างกันให้ครบสามก๊วน นับเฉพาะผลที่ยืนยันแล้ว',
  },
];

export const BADGE_ICON = (id: string): string => `/badges/${id}.svg`;

export function badgeById(id: string): BadgeDefinition | undefined {
  return BADGES.find((b) => b.id === id);
}
