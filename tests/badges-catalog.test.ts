import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BADGES, BADGE_ICON, badgeById } from '@/lib/domain/badges';

/**
 * catalog ฝั่ง TS เป็นสำเนาของสองอย่างที่อยู่คนละที่: ไฟล์ artwork
 * (`badge-definitions.json`) กับกติกาใน migration
 *
 * สำเนาที่ไม่มีใครเฝ้าคือสำเนาที่วันหนึ่งจะไม่ตรง เทสนี้จึงเทียบกับทั้งสองแหล่ง
 * ไม่ใช่แค่นับว่ามีหกใบ
 */
describe('รายการ badge', () => {
  const definitionsPath = join(
    process.cwd(),
    'docs/design/social-tournament/badges/badge-definitions.json',
  );
  const definitions = JSON.parse(readFileSync(definitionsPath, 'utf8')) as {
    badges: { id: string; rarity: string }[];
  };

  it('ตรงกับไฟล์ที่มาพร้อม artwork ทั้ง id และระดับความหายาก', () => {
    expect(BADGES.map((b) => b.id)).toEqual(definitions.badges.map((b) => b.id));
    expect(BADGES.map((b) => b.rarity)).toEqual(definitions.badges.map((b) => b.rarity));
  });

  it('ทุกใบมีไอคอนอยู่จริงใน public/ ไม่ใช่รูปเสีย', () => {
    for (const badge of BADGES) {
      const file = join(process.cwd(), 'public', BADGE_ICON(badge.id));
      expect(existsSync(file), `ไม่พบไอคอนของ ${badge.id}`).toBe(true);
    }
  });

  it('ไม่มีไอคอนส่วนเกินที่ไม่มีใบรองรับ', () => {
    const shipped = readdirSync(join(process.cwd(), 'public/badges')).sort();
    expect(shipped).toEqual(BADGES.map((b) => `${b.id}.svg`).sort());
  });

  it('ทุกใบบอกได้ว่าต้องทำอะไรถึงจะได้ — ห้ามมีใบที่เงียบ', () => {
    for (const badge of BADGES) {
      expect(badge.hint.length, `${badge.id} ไม่มีคำใบ้`).toBeGreaterThan(10);
      expect(badge.name.length).toBeGreaterThan(0);
      expect(badge.description.length).toBeGreaterThan(0);
    }
  });

  it('ทุก id ที่กติกาใน SQL ให้ มีใบรองรับในแคตตาล็อก', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260930000100_badges.sql'),
      'utf8',
    );
    const awarded = [...sql.matchAll(/'(\d{2}-[a-z-]+)'/g)].map((m) => m[1]);

    // ถ้าตัวจับพัง รายการจะว่างแล้วข้อนี้จะผ่านฟรี
    expect(new Set(awarded).size).toBe(BADGES.length);
    for (const id of new Set(awarded)) {
      expect(badgeById(id), `SQL ให้ ${id} แต่ไม่มีในแคตตาล็อก`).toBeDefined();
    }
  });
});
