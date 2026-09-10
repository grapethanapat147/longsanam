/**
 * ตราลงสนาม — A / Flow Runner
 *
 * เรขาคณิตมาจาก docs/design/direction-04/logo/a-green.svg ซึ่งเป็นตัวเลือกที่
 * ชุด direction 04 ปักว่าแนะนำ สามเส้นกับหัวหนึ่งวง viewBox จัตุรัส 120 × 120
 * ปลายเส้นเป็น butt (ตัดตรง) ไม่ใช่ round — เป็นคุณลักษณะของชุดนี้ อย่าเปลี่ยน
 *
 * ถ้าต้องแก้รูปทรง ให้แก้ที่ไฟล์ SVG ต้นทางแล้วคัดลอก path มาที่นี่
 * จะได้ไม่มีตราสองเวอร์ชันที่ต่างกัน
 */
const ARMS = 'M17 51 C29 32 41 32 51 43 C63 57 76 63 99 52';
const BACK_LEG = 'M60 49 C48 60 47 80 30 86 Q21 89 12 85';
const FRONT_LEG = 'M52 68 L83 100';
const STROKE = 18;

type Tone = 'brand' | 'lime' | 'ink' | 'white';

const toneColour: Record<Tone, string> = {
  brand: 'var(--color-brand-600)',
  /* ไลม์วางบน brand-700 ขึ้นไปเท่านั้น บน brand-500 ได้ 2.32:1 อ่านไม่ออก */
  lime: 'var(--color-accent-500)',
  ink: 'var(--color-ink-900)',
  white: '#ffffff',
};

export function BrandMark({
  size = 32,
  tone = 'brand',
  className,
}: {
  size?: number;
  tone?: Tone;
  className?: string;
}) {
  const colour = toneColour[tone];
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden className={className}>
      <g
        fill="none"
        stroke={colour}
        strokeWidth={STROKE}
        strokeLinecap="butt"
        strokeLinejoin="round"
      >
        <path d={ARMS} />
        <path d={BACK_LEG} />
        <path d={FRONT_LEG} />
      </g>
      <circle cx="72" cy="21" r="11" fill={colour} />
    </svg>
  );
}
