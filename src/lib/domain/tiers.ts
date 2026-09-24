/**
 * ลำดับมือ — ตัวอักษรเดี่ยวกับคำอธิบายที่คนอ่านแล้วรู้เรื่อง (LSN-0044)
 *
 * `tournament_tier` เก็บเป็น 'N' 'S' 'P' 'C' 'B' 'A' ซึ่งคนในวงการแบดอ่านออก
 * แต่คนที่เพิ่งเข้ามาเห็นแล้วไม่รู้ว่าอะไรสูงกว่าอะไร และฟอร์มสร้างทัวร์นาเมนต์
 * บังคับให้เลือกตั้งแต่ก่อนจะมีใครมาอธิบาย
 *
 * ตัวอักษรยังเป็นค่าที่ไหลเข้าฐานข้อมูลเหมือนเดิม คำอธิบายอยู่แค่ชั้นที่ผู้ใช้เห็น
 *
 * ⚠️ เรียงจากใหม่ไปเก่ง และ **ไม่ใช่มาตรฐานกลางของวงการ** — สเปกเลือกลำดับนี้
 * หนึ่งชุดแล้วประกาศว่าใช้แบบนี้ ไม่พยายามรองรับทุกสนาม
 */

export type Tier = 'N' | 'S' | 'P' | 'C' | 'B' | 'A';

export const TIERS: ReadonlyArray<{ value: Tier; name: string; example: string }> = [
  { value: 'N', name: 'มือใหม่', example: 'เพิ่งเริ่มเล่น ยังไม่เคยลงแข่ง' },
  { value: 'S', name: 'เริ่มตีเป็น', example: 'ตีกับเพื่อนได้ รู้กติกาแล้ว' },
  { value: 'P', name: 'ตีประจำ', example: 'เล่นสม่ำเสมอ เคยแข่งกันเองในก๊วน' },
  { value: 'C', name: 'เคยลงแข่ง', example: 'เคยลงรายการสมัครเล่นมาบ้าง' },
  { value: 'B', name: 'มือดีของสนาม', example: 'อยู่หัวแถวของก๊วนที่ไปประจำ' },
  { value: 'A', name: 'มือเก่ง', example: 'ลงรายการใหญ่เป็นประจำ' },
];

/**
 * `'P'` → `'P · ตีประจำ'`
 *
 * ค่าที่ไม่รู้จักคืนตัวมันเองกลับไป เพราะหน้าจอที่แสดงรุ่นของงานที่มีอยู่แล้ว
 * ไม่ควรกลายเป็นช่องว่างเพียงเพราะมีใครเพิ่มรุ่นใหม่ในฐานข้อมูล
 */
export function tierLabel(value: string): string {
  const tier = TIERS.find((x) => x.value === value);
  return tier ? `${tier.value} · ${tier.name}` : value;
}

/** `'P'` → `'ตีประจำ'` — ชื่อรุ่นล้วน ไม่มีตัวอักษรนำ สำหรับที่แคบ */
export function tierName(value: string): string {
  return TIERS.find((x) => x.value === value)?.name ?? value;
}

export function tierExample(value: string): string | null {
  return TIERS.find((x) => x.value === value)?.example ?? null;
}
