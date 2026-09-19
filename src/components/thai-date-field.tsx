'use client';

import { useMemo } from 'react';
import { Field, Select } from '@/components/ui/primitives';
import { THAI_MONTHS_SHORT } from '@/lib/format';

/**
 * เลือกวันแบบ วัน / เดือน / ปี พ.ศ. (LSN-0041)
 *
 * `<input type="date">` ใช้ปฏิทินของระบบปฏิบัติการ ไม่ฟัง locale ของเว็บ คนไทย
 * จึงเห็นปีเป็น ค.ศ. เสมอ ส่วนการเขียนปฏิทินป๊อปอัปเองแปลว่าต้องดูแลตารางเดือน
 * ปุ่มเลื่อน คีย์บอร์ด กับดักโฟกัส และการแตะบนมือถือเองทั้งหมด
 *
 * สามช่องเลือกให้ผลเดียวกันคือเห็นปีเป็น พ.ศ. ด้วยโค้ดที่น้อยกว่ามาก และเป็น
 * แพตเทิร์นที่ฟอร์มไทยใช้กันจนคุ้น
 *
 * ⚠️ **ค่าที่ไหลออกไปยังเป็น ค.ศ. เสมอ** (`yyyy-mm-dd`) พ.ศ. อยู่แค่ชั้นที่ผู้ใช้เห็น
 * ถ้าปล่อยให้ พ.ศ. หลุดเข้าไปในระบบ จะมีวันที่ใครสักคนลืมลบ 543
 */

const WEEKDAYS = [
  'วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ',
  'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์',
];

const BE_OFFSET = 543;

/**
 * `Select` ปกติเติม `pr-8` เผื่อลูกศรไว้ **นอกเหนือจาก** ที่เบราว์เซอร์กันไว้ให้
 * ลูกศรของตัวเองอยู่แล้ว รวมกันแล้วกินราว 44px จากช่องที่กว้าง 78px บนจอ 320px
 * เหลือที่ให้ข้อความ 24px ทั้งที่คำว่า "เดือน" กว้าง 29px — คำจึงโดนตัด
 *
 * สามช่องนี้จึงคืนระยะขอบส่วนเกินนั้นกลับไปให้ข้อความ
 */
const COMPACT = 'px-2 pr-2';

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function ThaiDateField({
  id,
  label,
  hint,
  name,
  value,
  onChange,
  yearsAhead = 2,
}: {
  id: string;
  label: string;
  hint?: string;
  /**
   * ใส่เมื่อฟอร์มนั้นส่งค่าด้วยกลไกฟอร์มของเบราว์เซอร์แทน state (LSN-0042)
   * component นี้เป็น controlled จึงต้องมี hidden input พาค่าเข้าฟอร์มให้
   * วิซาร์ดสร้างนัดจะได้ไม่ต้องรื้อวิธีส่งฟอร์มทั้งตัว
   */
  name?: string;
  /** `yyyy-mm-dd` แบบ ค.ศ. หรือสตริงว่างเมื่อยังไม่เลือก */
  value: string;
  onChange: (next: string) => void;
  yearsAhead?: number;
}) {
  const [y, m, d] = value ? value.split('-').map(Number) : [0, 0, 0];

  const years = useMemo(() => {
    const thisYear = new Date().getFullYear();
    return Array.from({ length: yearsAhead + 1 }, (_, i) => thisYear + i);
  }, [yearsAhead]);

  function emit(nextY: number, nextM: number, nextD: number) {
    if (!nextY || !nextM || !nextD) return onChange('');
    // เปลี่ยนเดือนแล้ววันเกินที่เดือนนั้นมีจริง ให้ถอยมาวันสุดท้ายแทน
    // มิฉะนั้นจะได้ 31 กุมภาพันธ์ ซึ่ง Date จะเลื่อนไปเดือนถัดไปเงียบ ๆ
    const safeD = Math.min(nextD, daysInMonth(nextY, nextM));
    onChange(`${nextY}-${pad(nextM)}-${pad(safeD)}`);
  }

  const weekday =
    y && m && d ? WEEKDAYS[new Date(y, m - 1, d).getDay()] : null;

  return (
    <Field label={label} htmlFor={`${id}-day`} hint={hint}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div className="grid grid-cols-3 gap-1.5">
        <Select
          id={`${id}-day`}
          className={COMPACT}
          aria-label="วันที่"
          value={d || ''}
          onChange={(e) => emit(y || years[0], m || 1, Number(e.target.value))}
        >
          <option value="">วัน</option>
          {Array.from({ length: daysInMonth(y || years[0], m || 1) }, (_, i) => i + 1).map(
            (n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ),
          )}
        </Select>

        <Select
          id={`${id}-month`}
          className={COMPACT}
          aria-label="เดือน"
          value={m || ''}
          onChange={(e) => emit(y || years[0], Number(e.target.value), d || 1)}
        >
          <option value="">เดือน</option>
          {THAI_MONTHS_SHORT.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </Select>

        <Select
          id={`${id}-year`}
          className={COMPACT}
          aria-label="ปี พ.ศ."
          value={y || ''}
          onChange={(e) => emit(Number(e.target.value), m || 1, d || 1)}
        >
          <option value="">ปี</option>
          {years.map((yy) => (
            <option key={yy} value={yy}>
              {yy + BE_OFFSET}
            </option>
          ))}
        </Select>
      </div>

      {weekday ? (
        <p className="mt-1.5 text-xs font-medium text-brand-700">ตรงกับ {weekday}</p>
      ) : null}
    </Field>
  );
}
