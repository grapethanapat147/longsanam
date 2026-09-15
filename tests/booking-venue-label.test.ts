import { describe, expect, it } from 'vitest';
import { bookingVenueLabel } from '@/lib/format';

/**
 * LSN-0025 ปล่อยให้ `manual_venue_name` เป็นคอลัมน์ที่เขียนแล้วไม่มีใครอ่าน
 * ผู้จัดพิมพ์ชื่อสนามลงไป แล้วไม่มีหน้าจอไหนแสดงมันเลย ส่วนรายการการจอง
 * บนหน้าเดียวกันก็ขึ้น "ครั้งที่ 1 ·  · " คือคั่นลอย ๆ สองอัน
 *
 * เทสนี้เฝ้าทางกลับนั้น
 */
describe('bookingVenueLabel', () => {
  it('ใช้ชื่อที่ผู้จัดพิมพ์ เมื่อคอร์ตไม่ได้อยู่ในระบบ', () => {
    expect(
      bookingVenueLabel({ venues: null, courts: null, manual_venue_name: 'คอร์ตแบดลุงหมี' }),
    ).toBe('คอร์ตแบดลุงหมี · ผู้จัดหาเอง');
  });

  it('ใช้ชื่อสนามกับคอร์ตจากระบบ เมื่อจองผ่านสนามพันธมิตร', () => {
    expect(
      bookingVenueLabel({
        venues: { name: 'ทองหล่อ สปอร์ตคลับ' },
        courts: { name: 'คอร์ต A' },
        manual_venue_name: null,
      }),
    ).toBe('ทองหล่อ สปอร์ตคลับ · คอร์ต A');
  });

  it('ไม่ทิ้งตัวคั่นลอย ๆ เมื่อมีสนามแต่ไม่มีชื่อคอร์ต', () => {
    expect(
      bookingVenueLabel({
        venues: { name: 'ทองหล่อ สปอร์ตคลับ' },
        courts: null,
        manual_venue_name: null,
      }),
    ).toBe('ทองหล่อ สปอร์ตคลับ');
  });

  it('คืนข้อความว่าง ไม่ใช่ " · " เมื่อไม่มีอะไรเลย', () => {
    expect(bookingVenueLabel({ venues: null, courts: null, manual_venue_name: null })).toBe('');
  });

  it('ชื่อที่ผู้จัดพิมพ์ชนะ แม้เผลอมีสนามในระบบติดมาด้วย', () => {
    // check constraint ในฐานข้อมูลกันไม่ให้แถวเป็นแบบนี้อยู่แล้ว
    // ข้อนี้ล็อกว่าถ้ามันหลุดมาได้ ทางไหนจะถูกเลือก
    expect(
      bookingVenueLabel({
        venues: { name: 'ทองหล่อ สปอร์ตคลับ' },
        courts: { name: 'คอร์ต A' },
        manual_venue_name: 'คอร์ตแบดลุงหมี',
      }),
    ).toBe('คอร์ตแบดลุงหมี · ผู้จัดหาเอง');
  });
});
