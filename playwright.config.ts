import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke — เส้นทางคลิกจริง (LSN-0047)
 *
 * บั๊กสี่ตัวที่เจอเมื่อ 19 ก.ย. (LSN-0044 · LSN-0045) อยู่นอกสายตาของเทสที่มีอยู่
 * ทั้ง pgTAP 245 ข้อและ vitest 174 ข้อ เพราะไม่มีชุดไหนเดินเส้นทางที่ผู้ใช้เดินจริง
 *
 * ชุดนี้จึงมีหน้าที่เดียว: เดินเส้นทางหลักหนึ่งรอบด้วยเบราว์เซอร์จริง ไม่ได้มาแทน
 * pgTAP หรือ vitest ซึ่งยังเป็นที่ที่กติกาแต่ละข้อถูกปักไว้
 *
 * ⚠️ ต้องมี Supabase ในเครื่องรันอยู่ และฐานข้อมูลต้องเป็นชุด seed — `npm run e2e`
 * รีเซ็ตให้ก่อนเสมอ เพราะเทสสร้างก๊วนและทัวร์นาเมนต์จริงลงไป
 */
export default defineConfig({
  testDir: './e2e',
  // เส้นทางเดียวยาว ๆ ที่ต้องเดินตามลำดับ ขนานกันแล้วชนกันเองที่ข้อมูลชุดเดียวกัน
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3211',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  /**
   * รันกับ **production build** ไม่ใช่ dev server
   *
   * dev server ของ Next 16 ในเครื่องนี้ต่อ HMR websocket ไม่ได้
   * (`ERR_INVALID_HTTP_RESPONSE`) แล้วหน้าก็ไม่ hydrate ใน Chromium ของ Playwright
   * กรอกค่าเข้าช่องได้แต่ React ไม่รับรู้ ปุ่มที่ `disabled` ตามค่าจึงไม่มีวันเปิด
   *
   * นอกจากจะหายเจ็บแล้ว การเทสกับ build ยังตรงกับของที่ผู้ใช้ได้จริงมากกว่า
   * และไม่ต้องรอ dev server คอมไพล์ทีละหน้า
   *
   * ใช้พอร์ต 3211 เพื่อไม่ชนกับ dev server ที่เปิดค้างไว้ตอนพัฒนา
   */
  webServer: {
    command: 'npm run build && npm run start -- --port 3211',
    url: 'http://127.0.0.1:3211',
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
