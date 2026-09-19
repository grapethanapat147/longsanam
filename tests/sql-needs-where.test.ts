import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DELETE / UPDATE ที่ไม่มี WHERE ใช้ไม่ได้กับผู้ใช้จริง (LSN-0045)
 *
 * บทบาท `authenticator` ที่ PostgREST ต่อฐานข้อมูลถูกตั้งไว้ว่า
 * `session_preload_libraries = supautils, safeupdate` ส่วนขยายนั้นปฏิเสธ
 * DELETE/UPDATE ที่ไม่มี WHERE **ทุกคำสั่งในคำขอนั้น** รวมถึงคำสั่งที่อยู่ข้างใน
 * ฟังก์ชัน `security definer` เพราะเป็นการตั้งค่าระดับ session ไม่ใช่ระดับสิทธิ์
 *
 * pgTAP จับไม่ได้ เพราะเทสรันในสิทธิ์ `postgres` ซึ่งไม่ได้ preload ส่วนขยายนี้
 * — จุดบอดเดียวกับ LSN-0043 คือเทสเดินคนละทางกับผู้ใช้จริง ตัวเฝ้าจึงต้องอ่าน
 * ไฟล์ migration ตรง ๆ แทนที่จะพึ่งฐานข้อมูล
 */
describe('คำสั่งเขียนในไฟล์ migration', () => {
  function statements(sql: string): { line: number; text: string }[] {
    const found: { line: number; text: string }[] = [];
    const lines = sql.split('\n');

    lines.forEach((line, i) => {
      const code = line.replace(/--.*$/, '');
      // จับเฉพาะคำสั่งที่จบในบรรทัดเดียว คำสั่งหลายบรรทัดมี WHERE อยู่บรรทัดถัดไป
      if (/^\s*(delete\s+from|update)\s+[\w.".]+[^;]*;\s*$/i.test(code)) {
        found.push({ line: i + 1, text: code.trim() });
      }
    });

    return found;
  }

  it('DELETE และ UPDATE ทุกคำสั่งมี WHERE', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const offenders: string[] = [];

    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      const sql = readFileSync(join(dir, file), 'utf8');
      for (const stmt of statements(sql)) {
        if (!/\bwhere\b/i.test(stmt.text)) {
          offenders.push(`${file}:${stmt.line} → ${stmt.text}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('ตัวจับคำสั่งอ่านคำสั่งจริงเจอ ไม่ได้ว่างเปล่าแล้วเขียว', () => {
    // ถ้าตัวจับพัง มันจะไม่เจออะไรเลย แล้วเทสข้างบนจะเขียวโดยไม่ได้เฝ้าอะไร
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260926000100_safeupdate_player_skill.sql'),
      'utf8',
    );
    const found = statements(sql);

    expect(found.length).toBeGreaterThan(0);
    expect(found.every((s) => /\bwhere\b/i.test(s.text))).toBe(true);
  });
});
