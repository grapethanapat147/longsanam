#!/usr/bin/env node
/**
 * เขียน `.env.local` จากค่าที่ Supabase ในเครื่องรันพิมพ์ออกมา (LSN-0051)
 *
 * ใช้ใน CI เท่านั้น — เครื่องของคนทำงานมีไฟล์นี้อยู่แล้ว สคริปต์จึงปฏิเสธที่จะเขียนทับ
 * เว้นแต่สั่งด้วย `--force` จะได้ไม่มีใครเผลอรันแล้วทับค่าที่ตั้งเอง
 *
 * คีย์ของ Supabase ในเครื่องเป็นค่าคงที่สำหรับ dev ไม่ใช่ความลับ แต่อ่านจาก
 * `status` แทนที่จะฝังไว้ เพื่อไม่ต้องตามแก้เวลา CLI เปลี่ยนค่า
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const TARGET = '.env.local';
const force = process.argv.includes('--force');

if (existsSync(TARGET) && !force) {
  console.error(`${TARGET} มีอยู่แล้ว — ใส่ --force ถ้าตั้งใจจะเขียนทับ`);
  process.exit(1);
}

function supabase(args) {
  try {
    execFileSync('supabase', ['--version'], { stdio: 'ignore' });
    return execFileSync('supabase', args, { encoding: 'utf8' });
  } catch {
    return execFileSync('npx', ['supabase', ...args], { encoding: 'utf8' });
  }
}

/**
 * ⚠️ `supabase status -o json` พิมพ์บรรทัด "Stopped services: [...]" นำหน้า JSON
 * จึงต้องตัดตั้งแต่ปีกกาแรก ไม่ใช่ `JSON.parse` ทั้งก้อน — เจอตอนทดสอบในเครื่อง
 * ก่อนส่งขึ้น CI พอดี
 */
const raw = supabase(['status', '-o', 'json']);
const status = JSON.parse(raw.slice(raw.indexOf('{')));

const lines = [
  `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
  `SUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}`,
  // พอร์ตเดียวกับที่ playwright.config.ts สั่ง `next start`
  'NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3211',
  'PAYMENT_PROVIDER=mock',
  'MOCK_PAYMENT_FAILURE_RATE=0',
  'CRON_SECRET=ci-cron-secret',
];

for (const key of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) {
  if (!status[key]) {
    console.error(`supabase status ไม่ได้คืนค่า ${key} — Supabase ในเครื่องรันอยู่จริงไหม`);
    process.exit(1);
  }
}

writeFileSync(TARGET, `${lines.join('\n')}\n`);
console.log(`เขียน ${TARGET} แล้ว (${lines.length} บรรทัด) จาก ${status.API_URL}`);
