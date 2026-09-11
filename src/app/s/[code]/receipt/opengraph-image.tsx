import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { loadSessionReceipt } from '@/lib/queries';

export const alt = 'ใบเสร็จก๊วน';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The picture in the LINE chat is the feature; the link is how you get detail.
 *
 * Built from the masked view (null viewer) on purpose — this image is rendered
 * for whoever the chat app is, which is nobody in particular.
 *
 * ImageResponse runs Satori, not a browser: no Tailwind, no cascade, every
 * element needs an explicit `display`, and it ships no Thai font at all.
 * Without the .ttf files below every Thai glyph renders as an empty box, so
 * this is the first place in the project that needs a font *file* rather than
 * the CSS variable `next/font/google` gives the pages.
 *
 * They must be *static* instances. Satori cannot parse a variable font: fed
 * the `Anuphan[wght].ttf` Google Fonts ships, it throws `Cannot read
 * properties of undefined (reading '256')` and the whole response fails to
 * pipe. See `src/assets/fonts/README.md` for how these two were cut from it.
 * Satori also does not synthesise bold, so 700 is a second file, not a flag.
 *
 * A preview card is decoration. If the data cannot be fetched the card still
 * has to be a PNG — a chat app asking for og:image should never be able to make
 * a route throw, and it should never be able to make one hang either. A chat
 * app waits a second or two and gives up, so the fetch is raced against a
 * deadline rather than merely caught: observed in dev with the database
 * unreachable, an uncapped call sat there past 90 seconds.
 */
const DATA_DEADLINE_MS = 2500;
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const fontDir = join(process.cwd(), 'src/assets/fonts');
  const [regular, bold, data] = await Promise.all([
    readFile(join(fontDir, 'Anuphan-Regular.ttf')),
    readFile(join(fontDir, 'Anuphan-Bold.ttf')),
    Promise.race([
      loadSessionReceipt(code, null).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DATA_DEADLINE_MS)),
    ]),
  ]);
  const t = data?.totals;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: '#ffffff',
          fontFamily: 'Anuphan',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, color: '#0a7a4f', letterSpacing: 2 }}>
          LONGSANAM
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 68,
            fontWeight: 700,
            color: '#0d1f18',
            marginTop: 12,
          }}
        >
          {t?.title ?? 'ใบเสร็จก๊วน'}
        </div>

        <div style={{ display: 'flex', gap: 56, marginTop: 48, fontSize: 34, color: '#35473f' }}>
          <div style={{ display: 'flex' }}>ผู้เล่น {t?.players ?? 0} คน</div>
          <div style={{ display: 'flex' }}>จ่ายแล้ว {t?.paid ?? 0}</div>
          <div style={{ display: 'flex' }}>ค้าง {t?.owing ?? 0}</div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 56,
            fontWeight: 700,
            color: '#0a7a4f',
          }}
        >
          คนละ ฿{t?.perHeadThb ?? 0}
        </div>

        <div style={{ display: 'flex', height: 12, background: '#bfec33', marginTop: 52 }} />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Anuphan', data: regular, style: 'normal', weight: 400 },
        { name: 'Anuphan', data: bold, style: 'normal', weight: 700 },
      ],
    },
  );
}
