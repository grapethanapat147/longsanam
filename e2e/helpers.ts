import { expect, type Locator, type Page } from '@playwright/test';

/**
 * กรอกค่าแล้วยืนยันว่ามันติดจริง ถ้าไม่ติดก็กรอกใหม่
 *
 * ⚠️ นี่ไม่ใช่การรอแบบมั่ว ๆ — หน้าเป็น React Server Component ที่ hydrate ทีหลัง
 * ค่าที่กรอกก่อน hydrate จะถูก React เขียนทับด้วย state ตั้งต้น (สตริงว่าง) แล้ว
 * ปุ่มที่ `disabled` ตามความยาวของค่าก็จะไม่มีวันเปิด เทสจะค้างจนหมดเวลาโดยที่
 * ไม่มีอะไรพังจริง
 *
 * ใช้กับทุกช่องที่เป็น controlled input ไม่ใช่เฉพาะช่องที่เคยพัง
 */
export async function fillStable(locator: Locator, value: string): Promise<void> {
  await expect
    .poll(
      async () => {
        await locator.fill(value);
        return locator.inputValue();
      },
      { timeout: 15_000 },
    )
    .toBe(value);
}

/** เหตุผลเดียวกับ `fillStable` แต่สำหรับ `<select>` */
export async function selectStable(locator: Locator, value: string): Promise<void> {
  await expect
    .poll(
      async () => {
        await locator.selectOption(value);
        return locator.inputValue();
      },
      { timeout: 15_000 },
    )
    .toBe(value);
}

/** รหัสผ่านของบัญชีเดโมทุกใบ เขียนไว้ตรง ๆ ใน `supabase/seed.sql` */
const DEMO_PASSWORD = 'password123';

export const DEMO = {
  /** มีน — seed จงใจไม่ให้เป็นเจ้าของก๊วนไหนเลย ใช้เริ่มจากศูนย์ได้ */
  meen: 'player3@longsanam.test',
  /** แนน — เจ้าของ แบดเช้าพระราม 9 ใช้เป็นก๊วนที่สมัครเข้ามา */
  nan: 'player1@longsanam.test',
} as const;

export async function signIn(page: Page, email: string, next?: string): Promise<void> {
  await page.goto(next ? `/auth/sign-in?next=${encodeURIComponent(next)}` : '/auth/sign-in');
  await fillStable(page.locator('#email'), email);
  await fillStable(page.locator('#password'), DEMO_PASSWORD);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page.locator('#email')).toHaveCount(0);
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await expect(page.getByRole('link', { name: 'เข้าสู่ระบบ', exact: true }).first()).toBeVisible();
}

/**
 * เลือกวันในชุด วัน/เดือน/ปี พ.ศ. (LSN-0041)
 *
 * ค่าใน `<option>` ยังเป็น ค.ศ. เสมอ ส่วน พ.ศ. อยู่แค่ข้อความที่ผู้ใช้เห็น
 * เทสจึงส่ง ค.ศ. เข้าไป แล้วค่อยยืนยันว่าข้อความที่โชว์เป็น พ.ศ.
 */
export async function pickThaiDate(
  page: Page,
  idPrefix: string,
  date: { day: number; month: number; year: number },
): Promise<void> {
  await selectStable(page.locator(`#${idPrefix}-day`), String(date.day));
  await selectStable(page.locator(`#${idPrefix}-month`), String(date.month));
  await selectStable(page.locator(`#${idPrefix}-year`), String(date.year));
}

/** ปีหน้าเสมอ เพื่อให้เทสไม่หมดอายุตอนสิ้นปี */
export function nextYear(): number {
  return new Date().getFullYear() + 1;
}
