import { expect, test } from '@playwright/test';
import {
  DEMO,
  fillStable,
  nextYear,
  pickThaiDate,
  selectStable,
  signIn,
  signOut,
} from './helpers';

/**
 * เส้นทางหลักหนึ่งรอบ: สร้างก๊วน → เปิดทัวร์นาเมนต์ → ก๊วนอื่นสมัคร → จ่ายทั้งคู่
 * → ยืนยันคอร์ต → บันทึกผล → อีกฝั่งยืนยัน (LSN-0047)
 *
 * ทุกข้อที่ `expect` ในนี้เคยพังจริงบนเบราว์เซอร์ ไม่ใช่การตรวจว่าปุ่มมีอยู่
 *
 * | สิ่งที่เฝ้า | ตั๋ว |
 * | --- | --- |
 * | หน้ารายการทัวร์นาเมนต์ขึ้นงานที่เพิ่งสร้าง | LSN-0044 |
 * | ปุ่ม "1 สัปดาห์ก่อนแข่ง" ถอยเจ็ดวันจริง | LSN-0044 |
 * | ประตูจ่ายเงินตอบเท่ากันทั้งเจ้าภาพและผู้สมัคร | LSN-0045 |
 * | ยืนยันผลแมตช์สำเร็จในสิทธิ์ผู้ใช้ทั่วไป | LSN-0045 |
 * | ฝั่งตรงข้ามไม่เสนอคนที่อยู่ฝั่งเราแล้ว | LSN-0048 |
 */
test('เดินเส้นทางทัวร์นาเมนต์จนจบ', async ({ page }) => {
  const stamp = Date.now();
  const groupName = `ก๊วนอีทูอี ${stamp}`;
  const title = `ศึกอีทูอี ${stamp}`;
  const matchDate = { day: 6, month: 12, year: nextYear() };

  await test.step('เข้าระบบเป็นคนที่ยังไม่มีก๊วนของตัวเอง', async () => {
    await signIn(page, DEMO.meen, '/app/tournaments/new');

    /*
      ฟอร์มที่ช่องเจ้าภาพว่างคือฟอร์มที่กดแล้วพังแน่นอน หน้าจึงต้องบอกทางออกแทน

      ข้อนี้เป็นตัวเช็กเงื่อนไขตั้งต้นไปในตัว — ถ้าแดง แปลว่าฐานข้อมูลไม่ใช่ชุด seed
      สด ๆ (รอบก่อนสร้างก๊วนค้างไว้) ไม่ได้แปลว่าโค้ดพัง
    */
    await expect(
      page.getByText('ต้องมีก๊วนของตัวเองก่อน'),
      'ต้องรันบนฐานข้อมูลที่เพิ่ง seed — ใช้ `npm run e2e` ซึ่งรีเซ็ตให้ก่อนเสมอ',
    ).toBeVisible();
  });

  await test.step('สร้างก๊วน', async () => {
    await page.getByRole('link', { name: 'ไปสร้างก๊วน' }).click();
    await fillStable(page.getByLabel('ชื่อก๊วน'), groupName);
    await fillStable(page.getByLabel('ย่านที่เล่นประจำ'), 'บางนา');
    await page.getByRole('button', { name: 'สร้างก๊วน' }).click();

    // ไปหน้าก๊วนที่เพิ่งสร้าง แล้วผู้ใช้เป็นเจ้าของจริง
    await expect(page).toHaveURL(/\/app\/groups\/[0-9a-f-]{36}$/);
    await expect(page.getByText('เจ้าของก๊วน', { exact: true })).toBeVisible();
  });

  await test.step('สร้างทัวร์นาเมนต์ ขั้นต่ำสองทีม', async () => {
    await page.goto('/app/tournaments/new');
    await fillStable(page.locator('#tn-title'), title);
    await selectStable(page.locator('#tn-tier'), 'B');

    // ตัวอย่างของรุ่นที่เลือกต้องเปลี่ยนตาม ไม่ใช่ค้างอยู่ที่รุ่นตั้งต้น (LSN-0044)
    await expect(page.getByText('อยู่หัวแถวของก๊วนที่ไปประจำ')).toBeVisible();

    await pickThaiDate(page, 'tn-date', matchDate);

    // ปฏิทินเป็น พ.ศ. จริง ไม่ใช่ ค.ศ. (LSN-0041)
    await expect(page.locator('#tn-date-year')).toContainText(String(matchDate.year + 543));

    await page.getByRole('button', { name: '1 สัปดาห์ก่อนแข่ง' }).click();

    /*
      6 ธ.ค. ถอยเจ็ดวันคือ 29 พ.ย. — ก่อนแก้ LSN-0044 ได้ 28 พ.ย. เพราะ
      `toISOString()` แปลงเที่ยงคืนเวลาไทยเป็น 17:00 ของวันก่อนหน้าใน UTC
    */
    await expect(page.locator('#tn-deadline-day')).toHaveValue('29');
    await expect(page.locator('#tn-deadline-month')).toHaveValue('11');

    await fillStable(page.locator('#tn-min'), '2');
    await fillStable(page.locator('#tn-fee'), '300');
    await page.getByRole('button', { name: 'สร้างทัวร์นาเมนต์' }).click();

    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  });

  await test.step('หน้ารายการขึ้นงานที่เพิ่งสร้าง', async () => {
    // เคยขึ้น "ยังไม่มีทัวร์นาเมนต์" ตลอดเพราะ embed groups กำกวม (LSN-0044)
    await page.goto('/app/tournaments');
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText('B · มือดีของสนาม').first()).toBeVisible();
  });

  const inviteUrl = await test.step('เปิดรับสมัครแล้วจ่ายค่าสมัคร', async () => {
    await page.getByText(title).click();
    await page.getByRole('button', { name: 'เปิดรับสมัคร' }).click();
    await page.getByRole('button', { name: 'จ่ายค่าสมัคร' }).click();

    await expect(page.getByText('1/1')).toBeVisible();

    const url = await page.getByRole('textbox', { name: 'สมัครเข้าแข่ง' }).inputValue();
    expect(url).toContain('/t/');
    return url;
  });

  await test.step('ก๊วนอื่นสมัครเข้ามาแล้วจ่าย', async () => {
    await signOut(page);
    await signIn(page, DEMO.nan, new URL(inviteUrl).pathname);

    await page.getByRole('button', { name: 'สมัครในนามก๊วนนี้' }).click();
    await expect(page.getByText('2 ทีม จากขั้นต่ำ 2')).toBeVisible();

    await page.getByRole('button', { name: 'จ่ายค่าสมัคร' }).click();

    /*
      ประตูนี้เคยตอบไม่เหมือนกันตามคนดู เจ้าภาพเห็น 2/2 ส่วนก๊วนที่สมัครเข้ามา
      เห็น 1/2 เพราะ policy ของตารางการจ่ายเงินเปิดให้อ่านแค่แถวของตัวเอง (LSN-0045)
    */
    await expect(page.getByText('2/2')).toBeVisible();
    await expect(page.getByText('ยังไม่จ่าย')).toHaveCount(0);
  });

  await test.step('เจ้าภาพยืนยันคอร์ต แล้วบันทึกผล', async () => {
    await signOut(page);
    await signIn(page, DEMO.meen, '/app/tournaments');
    await page.getByText(title).click();

    // เจ้าภาพต้องเห็น 2/2 เหมือนกัน — อีกครึ่งของความไม่ตรงกันข้างบน
    await expect(page.getByText('2/2')).toBeVisible();

    await fillStable(page.getByLabel('สนามที่จองได้'), 'คอร์ตอีทูอี 1-2');
    await page.getByRole('button', { name: 'ยืนยันคอร์ต' }).click();

    // ประตูครบสามบาน → งานพร้อมแข่ง → ฟอร์มบันทึกผลโผล่
    const sideB = page.locator('#match-side-b');
    await expect(sideB).toBeVisible();

    /*
      คนที่ลงฝั่งเราแล้วต้องไม่โผล่ในตัวเลือกฝั่งตรงข้าม (LSN-0048)
      ฐานข้อมูลปฏิเสธอยู่แล้วด้วย matches_no_player_on_both_sides แต่ผู้ใช้
      จะเห็นแค่ "เกิดข้อผิดพลาด" ที่ทำอะไรต่อไม่ถูก
    */
    const sideAValue = await page.locator('#match-side-a').inputValue();
    await expect(sideB.locator(`option[value="${sideAValue}"]`)).toHaveCount(0);

    await fillStable(page.locator('#score-a'), '21');
    await fillStable(page.locator('#score-b'), '15');
    await fillStable(page.locator('#court-label'), 'คอร์ต 1');
    await page.getByRole('button', { name: 'บันทึกผล' }).click();

    await expect(page.getByText('รอฝั่งตรงข้ามยืนยัน').first()).toBeVisible();
  });

  await test.step('อีกฝั่งยืนยันผล แล้วตารางคะแนนขึ้น', async () => {
    await signOut(page);
    await signIn(page, DEMO.nan, '/app/tournaments');
    await page.getByText(title).click();

    /*
      เคยขึ้น "เกิดข้อผิดพลาดที่ไม่คาดคิด" ทุกครั้ง เพราะ recompute_player_skill()
      มี DELETE ที่ไม่มี WHERE ซึ่งส่วนขยาย safeupdate ของบทบาท authenticator
      ปฏิเสธ — pgTAP จับไม่ได้เพราะรันในสิทธิ์ postgres (LSN-0045)
    */
    await page.getByRole('button', { name: 'ยืนยันผล' }).click();

    /*
      `exact: true` สำคัญ — ประตู "คอร์ตยืนยันแล้ว" มีคำว่า "ยืนยันแล้ว" อยู่ข้างใน
      ถ้าจับแบบ substring เทสจะเขียวทั้งที่การยืนยันล้มเหลว ซึ่งเป็นรูปแบบ
      "เทสที่ดูเหมือนเฝ้าแต่ไม่ได้เฝ้า" แบบเดียวกับ LSN-0022 · LSN-0035 · LSN-0045
    */
    await expect(page.getByText('ยืนยันแล้ว', { exact: true })).toBeVisible();
    await expect(
      page.getByText('เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง'),
    ).toHaveCount(0);

    // ตารางคะแนนนับเฉพาะแมตช์ที่ยืนยันแล้ว (LSN-0046)
    await expect(page.getByText('ตารางคะแนน')).toBeVisible();
    await expect(page.getByText('ชนะ 1/1')).toBeVisible();
  });
});
