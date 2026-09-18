import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ฟังก์ชันของเครื่องทุกตัวต้องมีคนเรียก (LSN-0035)
 *
 * บั๊กที่ตั๋วนี้แก้คือ `close_unfilled_tournaments()` ถูกเขียนครบ มีเทส pgTAP
 * ของตัวเอง มี `grant` ให้ `service_role` เรียบร้อย แต่ **ไม่มีโค้ดบรรทัดไหน
 * เรียกมันเลย** หน้าจอจึงสัญญากับผู้ใช้ว่าจะคืนเงินให้ แล้วไม่มีอะไรไปคืน
 *
 * ไม่มีเทสไหนจับได้ เพราะ pgTAP เรียกฟังก์ชันตรง ๆ จึงเขียวเสมอ ส่วนเทส
 * TypeScript ก็ไม่เคยแตะชั้นนี้
 *
 * เทสนี้จึงไม่ได้ดักชื่อฟังก์ชันตัวใดตัวหนึ่ง แต่ดัก **รูปแบบ**: RPC ที่ grant
 * ให้ `service_role` อย่างเดียวคือฟังก์ชันที่ผู้ใช้เรียกเองไม่ได้ ดังนั้นถ้าไม่มี
 * โค้ดฝั่งเราเรียก มันก็ไม่มีวันทำงาน — เป็นโค้ดตายที่ดูเหมือนยังมีชีวิต
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const SRC = join(process.cwd(), 'src');

/** ชื่อฟังก์ชันที่ grant ให้ service_role และ **ไม่ได้** grant ให้ผู้ใช้ปลายทาง */
function machineOnlyFunctions(): string[] {
  const grantedTo = new Map<string, Set<string>>();

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const pattern = /grant\s+execute\s+on\s+function\s+public\.([a-z0-9_]+)\s*\([^)]*\)\s*to\s+([a-z_,\s]+);/gi;
    for (const m of sql.matchAll(pattern)) {
      const name = m[1];
      const roles = m[2].split(',').map((r) => r.trim().toLowerCase());
      const set = grantedTo.get(name) ?? new Set<string>();
      for (const r of roles) set.add(r);
      grantedTo.set(name, set);
    }
  }

  return [...grantedTo.entries()]
    .filter(([, roles]) => roles.has('service_role'))
    .filter(([, roles]) => !roles.has('authenticated') && !roles.has('anon') && !roles.has('public'))
    .map(([name]) => name)
    .sort();
}

/**
 * `src/types/database.ts` ต้องถูกข้าม — มันคือกระจกเงาของสคีมาที่ลิสต์ชื่อ RPC
 * **ทุกตัว** อยู่แล้ว ถ้านับไฟล์นี้ด้วย เทสจะเจอชื่อเสมอไม่ว่าจะมีใครเรียกจริงหรือไม่
 * และกลายเป็นเทสที่ดูเหมือนเฝ้าแต่ไม่ได้เฝ้า — ซึ่งพิสูจน์มาแล้วตอนเขียนตั๋วนี้
 * ว่าเกิดขึ้นจริง เทสผ่านฉลุยทั้งที่ถอดการเรียกออกไปแล้ว
 */
const SCHEMA_MIRROR = join('src', 'types', 'database.ts');

function allSourceText(): string {
  const chunks: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !full.endsWith(SCHEMA_MIRROR)) {
        chunks.push(readFileSync(full, 'utf8'));
      }
    }
  };
  walk(SRC);
  return chunks.join('\n');
}

describe('RPC ของเครื่องต้องมีคนเรียก', () => {
  const machineOnly = machineOnlyFunctions();

  it('เจอฟังก์ชันของเครื่องจาก migration ได้จริง', () => {
    // ถ้าวันหนึ่งการอ่าน grant พัง รายการจะว่างแล้วเทสข้างล่างจะผ่านฟรี ๆ
    expect(machineOnly.length).toBeGreaterThanOrEqual(4);
    expect(machineOnly).toContain('close_unfilled_tournaments');
  });

  it('ยังมองเห็นจุดเรียกจริงหลังตัดไฟล์สคีมาออกแล้ว', () => {
    // ด่านคู่กับการข้าม database.ts — ถ้าตัดมากเกินไปจนไม่เหลือโค้ดให้ค้น
    // เทสข้างล่างจะแดงทุกอันโดยไม่มีเหตุผล ข้อนี้พิสูจน์ว่ายังค้นเจอของจริง
    const src = allSourceText();
    expect(src).not.toContain('Args: never; Returns: Json');
    expect(src).toContain('mark_no_shows');
  });

  it('ทุกตัวถูกอ้างถึงในโค้ดฝั่งเรา', () => {
    const src = allSourceText();
    const orphans = machineOnly.filter((fn) => !src.includes(fn));
    expect(
      orphans,
      `RPC เหล่านี้ grant ให้ service_role อย่างเดียว แปลว่าผู้ใช้เรียกเองไม่ได้ ` +
        `แต่ไม่มีโค้ดใน src/ เรียกมันเลย จึงไม่มีวันทำงาน: ${orphans.join(', ')}`,
    ).toEqual([]);
  });
});
