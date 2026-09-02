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
