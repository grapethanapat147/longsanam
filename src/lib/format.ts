import { LOCALE, TIME_ZONE } from '@/i18n';

/** Money is whole baht everywhere, so formatting never shows stray decimals. */
export function formatThb(amount: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

/**
 * ชื่อเดือนแบบย่อสำหรับช่องเลือกวันที่ (LSN-0044)
 *
 * ช่องเลือกสามช่องในแถวเดียวบนจอ 320px เหลือที่ให้ข้อความราว 46px ต่อช่อง
 * ชื่อเต็มอย่าง "พฤศจิกายน" กว้างเกินนั้นจนโดนตัด ชื่อย่อจึงไม่ใช่เรื่องสไตล์
 * แต่เป็นงบความกว้างที่มีจริง
 */
export const THAI_MONTHS_SHORT: readonly string[] = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/**
 * เลื่อนวันถอยหลังโดยไม่ข้ามเขตเวลา (LSN-0044)
 *
 * ⚠️ `toISOString()` แปลงเป็น UTC ก่อนเสมอ เที่ยงคืนตามเวลาไทยคือ 17:00
 * ของ *วันก่อนหน้า* ใน UTC ตัดสิบตัวแรกจึงได้วันที่เคลื่อนไปหนึ่งวัน
 * ปุ่ม "1 สัปดาห์ก่อนแข่ง" เคยกรอกให้แปดวันก่อนแข่งด้วยเหตุนี้
 */
export function dateMinusDays(date: string, days: number): string {
  if (!date) {
    return '';
  }
  const d = new Date(`${date}T00:00`);
  d.setDate(d.getDate() - days);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(toDate(value));
}

export function formatDateLong(value: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(toDate(value));
}

export function formatTime(value: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(toDate(value));
}

export function formatDateTime(value: Date | string): string {
  return `${formatDate(value)} ${formatTime(value)} น.`;
}

export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatTime(start)}–${formatTime(end)} น.`;
}

/** "อีก 2 ชั่วโมง 15 นาที" / "หมดเวลาแล้ว" — used for deadlines and holds. */
export function formatCountdown(target: Date | string, now: Date = new Date()): string {
  const ms = toDate(target).getTime() - now.getTime();
  if (ms <= 0) return 'หมดเวลาแล้ว';

  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `อีก ${days} วัน ${hours} ชั่วโมง`;
  if (hours > 0) return `อีก ${hours} ชั่วโมง ${minutes} นาที`;
  return `อีก ${minutes} นาที`;
}

export function durationHours(start: Date | string, end: Date | string): number {
  return (toDate(end).getTime() - toDate(start).getTime()) / 3_600_000;
}

/** Absolute, shareable URL for a session's public page. */
export function sessionShareUrl(publicCode: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3210').replace(/\/+$/, '');
  return `${base}/s/${publicCode}`;
}

export function groupShareUrl(publicCode: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3210').replace(/\/+$/, '');
  return `${base}/g/${publicCode}`;
}

export function tournamentShareUrl(publicCode: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3210').replace(/\/+$/, '');
  return `${base}/t/${publicCode}`;
}

/**
 * ชื่อสนามของการจองหนึ่งแถว
 *
 * การจองที่ผู้จัดยืนยันเอง (LSN-0025) ไม่ผูกกับสนามในระบบ `venues`/`courts`
 * จึงว่างทั้งคู่ และชื่อที่ผู้จัดพิมพ์อยู่ใน `manual_venue_name` แทน
 * ถ้าไม่มีทางกลับนี้ หน้าจอจะขึ้น "ครั้งที่ 1 ·  · " คือคั่นลอย ๆ สองอัน
 * แล้วชื่อสนามที่ผู้จัดเพิ่งพิมพ์เองก็ไม่โผล่ที่ไหนเลย
 */
export function bookingVenueLabel(booking: {
  venues: { name: string } | null;
  courts: { name: string } | null;
  manual_venue_name: string | null;
}): string {
  if (booking.manual_venue_name) return `${booking.manual_venue_name} · ผู้จัดหาเอง`;
  return [booking.venues?.name, booking.courts?.name].filter(Boolean).join(' · ');
}
