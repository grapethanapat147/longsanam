/**
 * ส่วนแบ่งของรายการเก็บเงินเพิ่ม (LSN-0024)
 *
 * เป็นสำเนาฝั่ง TypeScript ของเลขที่ create_session_charge() คำนวณ มีไว้ให้ UI
 * บอกผู้จัดล่วงหน้าว่าใครจะโดนเท่าไร **ก่อน** กดสร้าง ไม่ใช่ให้เขารู้ตอนที่มัน
 * กลายเป็นหนี้ของคนอื่นไปแล้ว
 *
 * ตัวเลขต้องตรงกับฝั่ง SQL เป๊ะ ๆ ถ้าไม่ตรง กล่องยืนยันจะโกหก ซึ่งแย่กว่าไม่มี
 * กล่องยืนยันเลย — เทสใน tests/charge-split.test.ts ล็อกตัวอย่างจาก spec ไว้
 */

/** ปัดขึ้น ผู้จัดรับส่วนต่าง — กติกาเดียวกับ LSN-0021 */
export function chargeShareThb(amountThb: number, people: number): number {
  if (people <= 0) return 0;
  return Math.ceil(amountThb / people);
}

/**
 * ยอดที่เก็บเกินจากการปัด ซึ่งตกเป็นของผู้จัด
 *
 * ฿100 หาร 3 คน = คนละ ฿34 เก็บได้ ฿102 ผู้จัดได้เกิน ฿2 — ดีกว่าเก็บขาด
 * แล้วผู้จัดต้องออกเอง และเป็นพฤติกรรมที่ผู้ใช้เจอมาแล้วจาก LSN-0021
 */
export function chargeOverageThb(amountThb: number, people: number): number {
  if (people <= 0) return 0;
  return chargeShareThb(amountThb, people) * people - amountThb;
}

/** ยอดที่ต้องกดยืนยันอีกครั้ง เพราะสูงพอที่จะเป็นการพิมพ์ผิด */
export const CHARGE_CONFIRM_THRESHOLD_THB = 2000;

export function chargeNeedsConfirm(amountThb: number): boolean {
  return amountThb > CHARGE_CONFIRM_THRESHOLD_THB;
}
