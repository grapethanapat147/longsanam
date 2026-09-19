import { describe, expect, it } from 'vitest';
import { THAI_MONTHS_SHORT } from '@/lib/format';

/**
 * ช่อง วัน · เดือน · ปี อยู่ในแถวเดียวกัน บนจอ 320px แต่ละช่องกว้างราว 78px
 * หักระยะขอบกับลูกศรของเบราว์เซอร์แล้วเหลือที่ให้ข้อความราว 46px
 *
 * ก่อนหน้านี้ใช้ชื่อเดือนเต็มแล้วต้องบีบช่องวันให้แคบกว่าคำว่า "วัน" จนโชว์ "วั"
 * เทสนี้เฝ้าไม่ให้ชื่อเดือนโตกลับไปเกินงบความกว้างนั้นอีก
 */
describe('ชื่อเดือนย่อในช่องเลือกวันที่', () => {
  it('มีครบสิบสองเดือน เรียงตามลำดับปฏิทิน', () => {
    expect(THAI_MONTHS_SHORT).toHaveLength(12);
    expect(THAI_MONTHS_SHORT[0]).toBe('ม.ค.');
    expect(THAI_MONTHS_SHORT[11]).toBe('ธ.ค.');
  });

  it('ทุกเดือนสั้นพอที่จะอยู่ในช่องแคบได้', () => {
    for (const month of THAI_MONTHS_SHORT) {
      expect(month.length).toBeLessThanOrEqual(5);
    }
  });

  it('ไม่มีเดือนซ้ำกัน', () => {
    expect(new Set(THAI_MONTHS_SHORT).size).toBe(12);
  });
});
