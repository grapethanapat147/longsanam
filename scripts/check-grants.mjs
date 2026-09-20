#!/usr/bin/env node
/**
 * เทียบสิทธิ์ของฟังก์ชันระหว่างฐานข้อมูลในเครื่องกับ production (LSN-0049)
 *
 * ทำไมไม่ใช่ pgTAP: production ไม่ได้ติดตั้งส่วนขยาย `pgtap` (เป็นของฝั่ง dev)
 * `supabase test db --linked` จึงล้มตั้งแต่ `select plan(...)`
 *
 * ทำไมต้องมี: `20260901000300_rls.sql` ปิดประตูให้ฟังก์ชันที่มีอยู่ ณ วันนั้น
 * ฟังก์ชันที่สร้างทีหลังไม่เคยผ่านประตูบานนั้น และบน Supabase cloud ฟังก์ชันใหม่
 * ยังได้ EXECUTE แจกให้ `anon`/`authenticated` จาก default privileges อีกชั้น
 *
 * ⚠️ **ต้องเทียบสิทธิ์ที่มีผลจริง ไม่ใช่ข้อความในดัมป์**
 * รอบแรกผมเทียบบรรทัด GRANT/REVOKE ตรง ๆ แล้วได้ตัวเลขผิดเป็น 47 ฟังก์ชัน
 * เพราะฟังก์ชันที่ยังไม่มี ACL จะ *ไม่มีบรรทัดอะไรเลยในดัมป์* ทั้งที่ PUBLIC
 * เรียกได้ ฝั่งในเครื่องจึงต้องถาม `has_function_privilege` จากฐานข้อมูลตรง ๆ
 * ส่วนฝั่ง production อ่านจากดัมป์ด้วยกติกา "มี GRANT ให้ anon/authenticated
 * **หรือ** ไม่มีบรรทัด ACL เลย = เปิด"
 *
 *   npm run check:grants
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'longsanam-grants-'));

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function localDbUrl() {
  const status = run('npx', ['supabase', 'status', '-o', 'json']);
  const json = JSON.parse(status.slice(status.indexOf('{')));
  return json.DB_URL;
}

/** สิทธิ์ที่มีผลจริงในเครื่อง ถามฐานข้อมูลตรง ๆ */
function localEffective() {
  const sql = `
    select p.proname || '|' ||
           (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute'))::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname = 'public'
      and d.objid is null
      and p.prorettype <> 'pg_catalog.trigger'::regtype`;

  const out = run('psql', [localDbUrl(), '-X', '-At', '-c', sql]);
  const map = new Map();
  for (const line of out.trim().split('\n')) {
    const [name, open] = line.split('|');
    if (name) map.set(name, open === 'true');
  }
  return map;
}

/** สิทธิ์ที่มีผลจริงบน production อ่านจากดัมป์สคีมา */
function remoteEffective() {
  const file = join(dir, 'remote.sql');
  execFileSync('npx', ['supabase', 'db', 'dump', '--linked', '-f', file], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const sql = readFileSync(file, 'utf8');

  return (name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const granted = new RegExp(`ON FUNCTION "public"\\."${escaped}"\\([^)]*\\) TO "(anon|authenticated)"`).test(sql);
    const hasAcl = new RegExp(`ON FUNCTION "public"\\."${escaped}"\\(`).test(sql);
    // ไม่มีบรรทัด ACL เลย = ค่าเริ่มต้นของ PostgreSQL = PUBLIC เรียกได้
    return granted || !hasAcl;
  };
}

console.log('อ่านสิทธิ์ในเครื่องและดัมป์ production…');
const local = localEffective();
const isOpenOnProd = remoteEffective();

const drift = [];
for (const [name, openLocally] of local) {
  if (openLocally) continue; // ในเครื่องเปิด → production เปิดก็ถูกแล้ว
  if (isOpenOnProd(name)) drift.push(name);
}

if (drift.length === 0) {
  console.log(`✅ ไม่มีฟังก์ชันที่ปิดในเครื่องแต่เปิดบน production (ตรวจ ${local.size} ตัว)`);
  process.exit(0);
}

console.error(`\n❌ ปิดในเครื่องแต่เปิดบน production ${drift.length} ฟังก์ชัน:\n`);
for (const name of drift.sort()) console.error(`  ${name}()`);
console.error('\nแก้ด้วย migration ที่ `revoke execute ... from public, anon, authenticated` แล้ว `npx supabase db push`');
process.exit(1);
