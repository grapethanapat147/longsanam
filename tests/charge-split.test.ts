import { describe, expect, it } from 'vitest';
import {
  CHARGE_CONFIRM_THRESHOLD_THB,
  chargeNeedsConfirm,
  chargeOverageThb,
  chargeShareThb,
} from '@/lib/domain/charge-split';

describe('chargeShareThb', () => {
  it('ล็อกตัวอย่างจาก spec: ฿100 หาร 3 คน = คนละ ฿34', () => {
    expect(chargeShareThb(100, 3)).toBe(34);
  });

  it('หารลงตัวก็ไม่ปัดเกิน', () => {
    expect(chargeShareThb(300, 3)).toBe(100);
  });

  it('คนเดียวรับเต็ม', () => {
    expect(chargeShareThb(250, 1)).toBe(250);
  });

  it('ไม่มีใครเลย คืน 0 ไม่ใช่ Infinity', () => {
    // หารด้วยศูนย์ใน JS ได้ Infinity ซึ่งจะไหลไปโผล่บนหน้าจอเป็น "฿Infinity"
    expect(chargeShareThb(100, 0)).toBe(0);
    expect(chargeShareThb(100, -1)).toBe(0);
  });
});

describe('chargeOverageThb', () => {
  it('ล็อกตัวอย่างจาก spec: เก็บได้ ฿102 จากยอด ฿100 ผู้จัดได้เกิน ฿2', () => {
    expect(chargeOverageThb(100, 3)).toBe(2);
  });

  it('หารลงตัวแล้วไม่มีส่วนต่าง', () => {
    expect(chargeOverageThb(300, 3)).toBe(0);
  });

  it('ส่วนต่างไม่เคยติดลบ — ผู้จัดไม่มีทางเก็บขาด', () => {
    for (let amount = 1; amount <= 200; amount += 7) {
      for (let people = 1; people <= 12; people += 1) {
        expect(chargeOverageThb(amount, people)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('ไม่มีใครเลย คืน 0', () => {
    expect(chargeOverageThb(100, 0)).toBe(0);
  });
});

describe('chargeNeedsConfirm', () => {
  it('ยอดปกติไม่ต้องยืนยันซ้ำ', () => {
    expect(chargeNeedsConfirm(300)).toBe(false);
  });

  it('ยอดที่เท่ากับเพดานพอดี ยังไม่ต้องยืนยัน', () => {
    expect(chargeNeedsConfirm(CHARGE_CONFIRM_THRESHOLD_THB)).toBe(false);
  });

  it('เกินเพดานหนึ่งบาทก็ต้องยืนยัน', () => {
    expect(chargeNeedsConfirm(CHARGE_CONFIRM_THRESHOLD_THB + 1)).toBe(true);
  });

  it('ยอดที่เผลอใส่ศูนย์เกิน ต้องยืนยัน', () => {
    expect(chargeNeedsConfirm(5000)).toBe(true);
  });
});
