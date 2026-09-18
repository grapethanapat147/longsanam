import type { Metadata, Viewport } from 'next';
import { Anuphan, Bai_Jamjuree } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { t } from '@/i18n';

/**
 * Both faces are Cadson Demak designs, so the Thai and Latin share a skeleton
 * and sit on the same baseline — unlike a Thai webfont paired with whatever
 * Latin the system falls back to, which is what this app shipped with before.
 *
 * Anuphan carries body and UI text; Bai Jamjuree is slightly condensed and
 * technical, which suits headings on a product about booking courts.
 */
const anuphan = Anuphan({
  subsets: ['thai', 'latin'],
  variable: '--font-anuphan',
  display: 'swap',
});

const baiJamjuree = Bai_Jamjuree({
  subsets: ['thai', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-jamjuree',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: `${t.brand.name} — ${t.brand.tagline}`,
    template: `%s · ${t.brand.name}`,
  },
  description:
    'จัดทัวร์นาเมนต์แบดมินตันระหว่างก๊วนกันเอง เก็บค่าสมัครทีละก๊วน ' +
    'ทีมครบ เงินครบ คอร์ตยืนยัน ถึงเริ่มแข่ง ถ้าไม่ครบคืนเงินเต็มทุกก๊วน',
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={`${anuphan.variable} ${baiJamjuree.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
