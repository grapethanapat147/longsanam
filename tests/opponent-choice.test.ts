import { describe, expect, it } from 'vitest';
import { opponentChoice } from '@/lib/domain/opponent-choice';

/**
 * เจอตอนเดิน flow บันทึกผลบนเบราว์เซอร์ (LSN-0048) — seed มี มีน อยู่ทั้งสองก๊วน
 * ช่องฝั่งตรงข้ามจึงมีชื่อเธอให้เลือกทั้งที่เธออยู่ฝั่งนี้แล้ว
 */
describe('ตัวเลือกผู้เล่นฝั่งตรงข้าม', () => {
  const players = [
    { id: 'meen', name: 'มีน' },
    { id: 'nan', name: 'แนน' },
    { id: 'boss', name: 'บอส' },
  ];

  it('ตัดคนที่อยู่ฝั่งตัวเองออกจากตัวเลือก', () => {
    const { options } = opponentChoice(players, 'meen', 'nan');

    expect(options.map((p) => p.id)).toEqual(['nan', 'boss']);
  });

  it('คนที่เลือกไว้ยังอยู่ ก็ไม่ไปยุ่งกับเขา', () => {
    expect(opponentChoice(players, 'meen', 'boss').selected).toBe('boss');
  });

  it('คนที่เลือกไว้หายไปจากรายการ ให้เลื่อนไปคนแรกที่เหลือ', () => {
    // เลือก แนน ไว้ฝั่งตรงข้าม แล้วเปลี่ยนฝั่งตัวเองมาเป็น แนน
    expect(opponentChoice(players, 'nan', 'nan').selected).toBe('meen');
  });

  it('ไม่เหลือใครให้เลือก คืนค่าว่าง ไม่ใช่คนที่ห้ามเลือก', () => {
    const only = [{ id: 'meen', name: 'มีน' }];
    const { options, selected } = opponentChoice(only, 'meen', 'meen');

    expect(options).toEqual([]);
    expect(selected).toBe('');
  });

  it('ยังไม่ได้เลือกฝั่งตัวเอง ก็ไม่ตัดใครออก', () => {
    expect(opponentChoice(players, '', '').options).toHaveLength(3);
  });
});
