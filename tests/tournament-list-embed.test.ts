import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dateMinusDays } from '@/lib/format';

/**
 * สองบั๊กที่เจอตอนเดิน flow สร้างก๊วน → สร้างทัวร์นาเมนต์บนเบราว์เซอร์จริง
 * (LSN-0044) ทั้งคู่ "เงียบ" คือหน้าจอยังขึ้นปกติ แค่ผิด
 */

describe('embed groups จาก tournaments ต้องระบุ FK', () => {
  /**
   * `tournaments` ต่อกับ `groups` ได้สองทาง — `host_group_id` ตรง ๆ และผ่าน
   * `tournament_teams` แบบ many-to-many PostgREST จึงตอบ PGRST201 แล้ว
   * `const { data } = await ...` ที่ทิ้ง error ก็เรนเดอร์เป็น "ยังไม่มีทัวร์นาเมนต์"
   * หน้ารายการทัวร์นาเมนต์จึงว่างเปล่าตลอดโดยไม่มีใครรู้
   */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        return sourceFiles(full);
      }
      return /\.tsx?$/.test(entry) ? [full] : [];
    });
  }

  it('ไม่มีไฟล์ไหน embed groups จาก tournaments แบบไม่ระบุ FK', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      const code = readFileSync(file, 'utf8');
      let at = code.indexOf(".from('tournaments')");
      while (at !== -1) {
        // ดูเฉพาะ select ที่ตามมาติด ๆ ไม่ใช่ทั้งไฟล์
        const chunk = code.slice(at, at + 500);
        if (/\bgroups\s*\(/.test(chunk) && !/\bgroups!/.test(chunk)) {
          offenders.push(file.replace(process.cwd() + '/', ''));
        }
        at = code.indexOf(".from('tournaments')", at + 1);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('ปุ่มลัดกำหนดปิดรับสมัคร', () => {
  /**
   * `toISOString()` แปลงเป็น UTC ก่อน เที่ยงคืนเวลาไทยคือ 17:00 ของวันก่อนหน้า
   * ปุ่ม "1 สัปดาห์ก่อนแข่ง" จึงเคยกรอกให้ **แปด** วันก่อนแข่ง
   */
  it('ถอยเจ็ดวันได้เจ็ดวันจริง ไม่ใช่แปด', () => {
    expect(dateMinusDays('2027-12-05', 7)).toBe('2027-11-28');
    expect(dateMinusDays('2027-12-05', 14)).toBe('2027-11-21');
  });

  it('ข้ามเดือนและข้ามปีได้', () => {
    expect(dateMinusDays('2027-01-03', 7)).toBe('2026-12-27');
    expect(dateMinusDays('2028-03-01', 1)).toBe('2028-02-29');
  });

  it('ยังไม่เลือกวันแข่งก็ไม่ต้องเดา', () => {
    expect(dateMinusDays('', 7)).toBe('');
  });
});
