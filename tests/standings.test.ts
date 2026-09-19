import { describe, expect, it } from 'vitest';
import { championOf, computeStandings } from '@/lib/domain/standings';

/**
 * ก่อนตั๋วนี้ (LSN-0046) ทัวร์นาเมนต์ไม่มีตอนจบและไม่มีจุดไหนบอกว่าใครชนะ
 *
 * ด่านที่ต้องเฝ้า: ผลที่ยังไม่ยืนยันต้องไม่นับ และการเสมอกันที่หัวตารางต้องไม่
 * กลายเป็นแชมป์ตามลำดับตัวอักษร
 */
const teams = [
  { groupId: 'a', name: 'ก๊วนเอ' },
  { groupId: 'b', name: 'ก๊วนบี' },
  { groupId: 'c', name: 'ก๊วนซี' },
];

const match = (
  sideAGroupId: string,
  sideBGroupId: string,
  scoreA: number,
  scoreB: number,
  status = 'confirmed',
) => ({ sideAGroupId, sideBGroupId, scoreA, scoreB, status });

describe('ตารางคะแนน', () => {
  it('ทุกก๊วนมีแถวของตัวเองแม้ยังไม่ได้ลงแข่ง', () => {
    const rows = computeStandings(teams, []);

    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.played === 0)).toBe(true);
  });

  it('นับแพ้ชนะและแต้มได้เสียจากทั้งสองฝั่ง', () => {
    const rows = computeStandings(teams, [match('a', 'b', 21, 15)]);
    const a = rows.find((r) => r.groupId === 'a')!;
    const b = rows.find((r) => r.groupId === 'b')!;

    expect([a.wins, a.losses, a.pointsFor, a.pointsAgainst, a.diff]).toEqual([1, 0, 21, 15, 6]);
    expect([b.wins, b.losses, b.pointsFor, b.pointsAgainst, b.diff]).toEqual([0, 1, 15, 21, -6]);
  });

  it('ผลที่ยังไม่ยืนยันไม่นับ — ไม่งั้นฝั่งเดียวพิมพ์ขึ้นหัวตารางได้เอง', () => {
    const rows = computeStandings(teams, [
      match('a', 'b', 21, 0, 'recorded'),
      match('a', 'b', 21, 0, 'disputed'),
      match('a', 'b', 21, 0, 'voided'),
    ]);

    expect(rows.every((r) => r.played === 0)).toBe(true);
  });

  it('เรียงด้วยจำนวนชนะก่อน แล้วค่อยผลต่างแต้ม', () => {
    const rows = computeStandings(teams, [
      match('a', 'b', 21, 19),
      match('c', 'b', 21, 5),
      match('c', 'a', 21, 19),
    ]);

    // ซี ชนะสอง · เอ ชนะหนึ่ง · บี ไม่ชนะเลย
    expect(rows.map((r) => r.groupId)).toEqual(['c', 'a', 'b']);
  });

  it('ชนะเท่ากันตัดสินด้วยผลต่างแต้ม', () => {
    const rows = computeStandings(teams, [
      match('a', 'c', 21, 19),
      match('b', 'c', 21, 3),
    ]);

    expect(rows.slice(0, 2).map((r) => r.groupId)).toEqual(['b', 'a']);
  });

  it('สกอร์เท่ากันนับเป็นเสมอ ไม่ยกให้ฝั่งซ้ายเงียบ ๆ', () => {
    const rows = computeStandings(teams, [match('a', 'b', 21, 21)]);
    const a = rows.find((r) => r.groupId === 'a')!;

    expect([a.wins, a.losses, a.draws]).toEqual([0, 0, 1]);
  });

  it('แมตช์ของก๊วนที่ไม่ได้อยู่ในรายการทีมแล้ว ไม่ทำให้ตารางพัง', () => {
    const rows = computeStandings(teams, [match('a', 'ก๊วนที่ถอนตัว', 21, 10)]);

    expect(rows.every((r) => r.played === 0)).toBe(true);
  });
});

describe('แชมป์', () => {
  it('ยังไม่มีแมตช์ที่ยืนยัน ก็ยังไม่มีแชมป์', () => {
    expect(championOf(computeStandings(teams, []))).toBeNull();
  });

  it('หัวตารางที่ชัดเจนคือแชมป์', () => {
    const rows = computeStandings(teams, [match('a', 'b', 21, 10)]);

    expect(championOf(rows)?.groupId).toBe('a');
  });

  it('สองอันดับแรกเท่ากันทุกเกณฑ์ = ยังไม่มีแชมป์ ไม่ใช่เรียงตามตัวอักษร', () => {
    const rows = computeStandings(teams, [
      match('a', 'c', 21, 11),
      match('b', 'c', 21, 11),
    ]);

    expect(rows[0].wins).toBe(rows[1].wins);
    expect(rows[0].diff).toBe(rows[1].diff);
    expect(championOf(rows)).toBeNull();
  });
});
