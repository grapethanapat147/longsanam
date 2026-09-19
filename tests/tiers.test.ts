import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TIERS, tierExample, tierLabel } from '@/lib/domain/tiers';

/**
 * ฟอร์มสร้างทัวร์นาเมนต์เคยโชว์แค่ N S P C B A เปล่า ๆ ซึ่งคนที่เพิ่งเข้ามา
 * เลือกไม่ถูกเพราะไม่รู้ว่าอะไรสูงกว่าอะไร
 *
 * เทสที่เขียนแค่ว่า "TIERS มีหกตัว" จะเขียวต่อไปแม้มีคนเพิ่มรุ่นใหม่ใน enum
 * แล้วลืมใส่คำอธิบาย — ตัวที่เฝ้าจริงจึงต้องอ่าน enum จากไฟล์ migration
 */
describe('ลำดับมือ', () => {
  function enumValuesFromMigrations(): string[] {
    const dir = join(process.cwd(), 'supabase/migrations');
    for (const file of readdirSync(dir).sort()) {
      const sql = readFileSync(join(dir, file), 'utf8');
      const match = sql.match(/create type public\.tournament_tier as enum \(([^)]*)\)/);
      if (match) {
        return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      }
    }
    throw new Error('หา enum tournament_tier ใน supabase/migrations ไม่เจอ');
  }

  it('ทุกค่าใน enum ของฐานข้อมูลมีคำอธิบายเป็นภาษาคน', () => {
    const fromDb = enumValuesFromMigrations();

    expect(fromDb.length).toBeGreaterThan(0);
    expect(TIERS.map((x) => x.value)).toEqual(fromDb);
    for (const tier of TIERS) {
      expect(tier.name.length).toBeGreaterThan(0);
      expect(tier.example.length).toBeGreaterThan(0);
    }
  });

  it('ชื่อรุ่นไม่ซ้ำกัน — สองรุ่นที่อ่านแล้วเหมือนกันคือเลือกไม่ถูกเหมือนเดิม', () => {
    expect(new Set(TIERS.map((x) => x.name)).size).toBe(TIERS.length);
  });

  it('ป้ายที่แสดงมีทั้งตัวอักษรเดิมและคำอธิบาย', () => {
    expect(tierLabel('P')).toBe('P · ตีประจำ');
    expect(tierExample('N')).toBe('เพิ่งเริ่มเล่น ยังไม่เคยลงแข่ง');
  });

  it('รุ่นที่ไม่รู้จักคืนค่าเดิม ไม่ทำให้หน้าจอกลายเป็นช่องว่าง', () => {
    expect(tierLabel('Z')).toBe('Z');
    expect(tierExample('Z')).toBeNull();
  });
});
