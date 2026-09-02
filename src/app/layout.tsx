import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { t } from '@/i18n';

const notoThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-thai',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: `${t.brand.name} — ${t.brand.tagline}`,
    template: `%s · ${t.brand.name}`,
  },
  description:
    'รวมก๊วนกีฬา เก็บเงินค่าสนาม และจองคอร์ตอัตโนมัติ พร้อมคิวสำรองและการคืนเงินตามเงื่อนไข',
};

export const viewport: Viewport = {
  themeColor: '#0e7c57',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={notoThai.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
