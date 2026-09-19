/**
 * ตารางคะแนนและแชมป์ของทัวร์นาเมนต์ (LSN-0046)
 *
 * คิดจาก **แมตช์ที่ยืนยันแล้วเท่านั้น** ด้วยเหตุผลเดียวกับคะแนนฝีมือ (LSN-0031)
 * คือผลที่ฝั่งเดียวพิมพ์เข้ามาเองยังไม่ใช่ผล ถ้านับผลที่ยังไม่ยืนยัน ก๊วนหนึ่ง
 * จะพากันกรอกสกอร์ให้ตัวเองขึ้นหัวตารางได้โดยที่อีกฝั่งยังไม่ทันดู
 *
 * ไม่มี RPC ใหม่ หน้ารายละเอียดโหลดแมตช์อยู่แล้วและ RLS กรองให้แล้วว่าใครเห็นงานไหน
 */

export type StandingRow = {
  groupId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
};

type MatchInput = {
  status: string;
  sideAGroupId: string;
  sideBGroupId: string;
  scoreA: number;
  scoreB: number;
};

export function computeStandings(
  teams: readonly { groupId: string; name: string }[],
  matches: readonly MatchInput[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teams.map((team) => [
      team.groupId,
      {
        groupId: team.groupId,
        name: team.name,
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
      },
    ]),
  );

  for (const match of matches) {
    if (match.status !== 'confirmed') {
      continue;
    }

    const a = rows.get(match.sideAGroupId);
    const b = rows.get(match.sideBGroupId);

    // ก๊วนที่ถอนตัวออกไปแล้วยังมีแมตช์ค้างอยู่ได้ ข้ามไปดีกว่านับให้ทีมที่ไม่มีอยู่
    if (!a || !b) {
      continue;
    }

    a.played += 1;
    b.played += 1;
    a.pointsFor += match.scoreA;
    a.pointsAgainst += match.scoreB;
    b.pointsFor += match.scoreB;
    b.pointsAgainst += match.scoreA;

    if (match.scoreA > match.scoreB) {
      a.wins += 1;
      b.losses += 1;
    } else if (match.scoreA < match.scoreB) {
      b.wins += 1;
      a.losses += 1;
    } else {
      // แบดมินตันไม่มีเสมอ แต่ตารางยอมให้สกอร์เท่ากันได้ นับเป็นเสมอไว้ก่อน
      // ดีกว่าเงียบ ๆ ยกให้ฝั่ง A เหมือนที่ `>` เพียว ๆ จะทำ
      a.draws += 1;
      b.draws += 1;
    }
  }

  return [...rows.values()]
    .map((row) => ({ ...row, diff: row.pointsFor - row.pointsAgainst }))
    .sort(
      (x, y) =>
        y.wins - x.wins ||
        y.diff - x.diff ||
        y.pointsFor - x.pointsFor ||
        x.name.localeCompare(y.name, 'th'),
    );
}

/**
 * แชมป์ — หรือ `null` เมื่อยังตัดสินไม่ได้
 *
 * คืน `null` เมื่อยังไม่มีแมตช์ที่ยืนยัน หรือเมื่อสองอันดับแรก **เท่ากันทุกเกณฑ์**
 * การหยิบตัวแรกของ array มาประกาศเป็นแชมป์ทั้งที่เสมอกันอยู่คือการให้รางวัลตาม
 * ลำดับตัวอักษร ซึ่งแย่กว่าบอกตรง ๆ ว่ายังไม่มีผู้ชนะ
 */
export function championOf(rows: readonly StandingRow[]): StandingRow | null {
  const [first, second] = rows;

  if (!first || first.played === 0) {
    return null;
  }

  if (
    second &&
    second.wins === first.wins &&
    second.diff === first.diff &&
    second.pointsFor === first.pointsFor
  ) {
    return null;
  }

  return first;
}
