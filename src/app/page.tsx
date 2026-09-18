import Link from 'next/link';
import { t } from '@/i18n';
import { getCurrentUser } from '@/lib/auth';
import { loadDiscoverSessions, loadSports } from '@/lib/queries';
import { SiteFooter, SiteHeader, MockModeBanner } from '@/components/shell';
import { SessionCardLink } from '@/components/session-card';
import { CourtMotif } from '@/components/court-motif';
import { ButtonLink, Card } from '@/components/ui/primitives';

const STEPS = [
  {
    title: 'ตั้งก๊วนประจำ',
    body: 'รวมคนที่ตีด้วยกันอยู่แล้วไว้ที่เดียว ใช้ลิงก์เดียวชวนเข้าก๊วน',
  },
  {
    title: 'เปิดทัวร์นาเมนต์',
    body: 'ตั้งรุ่น ค่าสมัครต่อก๊วน และวันปิดรับ แล้วได้ลิงก์เดียวส่งเข้า LINE',
  },
  {
    title: 'ก๊วนอื่นสมัครและจ่าย',
    body: 'แต่ละก๊วนจ่ายค่าสมัครของตัวเอง ผู้จัดไม่ต้องสำรองเงินให้ใคร',
  },
  {
    title: 'บันทึกผล ยืนยันสองฝั่ง',
    body: 'ผลแมตช์นับได้ต่อเมื่อฝั่งตรงข้ามกดยืนยัน ฝั่งเดียวกรอกเองไม่นับ',
  },
];

/**
 * ประตูสามบาน — ใช้ถ้อยคำเดียวกับที่ผู้ใช้เห็นบนหน้าทัวร์นาเมนต์จริง (LSN-0034)
 *
 * ดึงจาก `t.tournaments.*` ตรง ๆ แทนการคิดคำโฆษณาใหม่ ถ้าหน้าแรกกับในแอป
 * ใช้คนละคำ ผู้ใช้ต้องมาแปลเองว่าอันเดียวกันหรือเปล่า
 */
const GATES = [
  [t.tournaments.gateTeams, 'ไม่ถึงขั้นต่ำ งานไม่เริ่ม'],
  [t.tournaments.gateMoney, 'ไม่มีใครต้องออกเงินก่อน'],
  [t.tournaments.gateCourt, 'รู้ว่าได้เล่นที่ไหนก่อนวันแข่ง'],
];

export default async function LandingPage() {
  const [user, { sessions, counts }, sports] = await Promise.all([
    getCurrentUser(),
    loadDiscoverSessions(),
    loadSports(),
  ]);

  /**
   * หน้าแรกโชว์เฉพาะกีฬาที่เปิดขายอยู่ (LSN-0034)
   *
   * นัดของกีฬาที่ปิดไปแล้วยังอยู่ในระบบและยังเปิดดูได้ตามที่ LSN-0033 ตั้งใจ
   * แต่การเอามาโชว์บนหน้าแรกทำให้หน้าเดียวกันขัดกันเอง — พาดหัวบอกว่าเป็น
   * ทัวร์นาเมนต์แบด แล้วการ์ดตัวอย่างข้างล่างเป็นฟุตบอล
   *
   * กรองตรงนี้ที่เดียว ไม่ไปแตะ /discover ซึ่งยังต้องแสดงนัดเก่าครบตามเดิม
   */
  const activeSports = new Set(sports.map((s) => s.slug));
  const featured = sessions
    .filter((x) => x.sports !== null && activeSports.has(x.sports.slug))
    .slice(0, 3);

  return (
    <div className="flex min-h-dvh flex-col">
      <MockModeBanner />
      <SiteHeader />

      <main className="flex-1">
        {/* -----------------------------------------------------------------
         * Hero. The court is drawn rather than described: a real badminton
         * court in painted lines, bled off the edge so the page reads as a
         * crop of something larger than the screen.
         * -------------------------------------------------------------- */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="drift pointer-events-none absolute -right-28 -top-32 h-[42rem] w-[20rem] text-brand-700/[0.13] sm:right-0 sm:w-[24rem] lg:right-20"
          >
            <CourtMotif className="h-full w-full" />
          </div>

          <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-14 sm:pt-20">
            <p className="flex items-center gap-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-brand-700">
              <span aria-hidden className="h-px w-7 bg-brand-500" />
              {t.brand.name}
            </p>

            <h1 className="mt-4 max-w-2xl text-[2.4rem] font-semibold leading-[1.15] tracking-tight text-ink-900 sm:text-6xl">
              ตีกับก๊วนเดิมทุกอาทิตย์
              <br />
              ถึงเวลา{' '}
              {/* The one promise, marked like a line painted on the court. */}
              <span className="relative inline-block">
                <span
                  aria-hidden
                  className="absolute inset-x-[-0.12em] bottom-[0.06em] -z-10 h-[0.4em] bg-accent-400"
                />
                เจอก๊วนอื่น
              </span>
            </h1>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-600 sm:text-lg">
              จัดทัวร์นาเมนต์แบดกันเองได้ โดยไม่มีใครต้องออกเงินก่อน
              ถ้าทีมไม่ครบภายในกำหนด ทุกก๊วนได้เงินคืนเต็ม
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href={user ? '/app/tournaments/new' : '/auth/sign-up'} size="lg">
                {t.tournaments.create}
              </ButtonLink>
              <ButtonLink href="/discover" size="lg" variant="secondary">
                {t.nav.discover}
              </ButtonLink>
            </div>

            <dl className="mt-12 grid max-w-xl gap-x-8 gap-y-5 border-t hairline pt-6 sm:grid-cols-3">
              {GATES.map(([term, desc]) => (
                <div key={term}>
                  <dt className="font-display text-sm font-semibold text-ink-900">{term}</dt>
                  <dd className="mt-0.5 text-sm text-ink-500">{desc}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 max-w-xl text-xs leading-relaxed text-ink-500">
              สามอย่างนี้ไม่มีอันไหนต้องมาก่อนอันไหน ครบเมื่อไรก็พร้อมแข่ง
            </p>
          </div>
        </section>

        <section className="border-t hairline bg-white/60">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-2xl font-semibold text-ink-900">จากก๊วนประจำ ถึงวันแข่ง</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-600">
              ก๊วนประจำคือฐาน ทัวร์นาเมนต์คือปลายทาง — ไม่ใช่ของสองอย่างที่ต้องเลือก
            </p>
            <ol className="mt-8 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="rise"
                  style={{ '--i': index } as React.CSSProperties}
                >
                  {/* The numeral is a painted marking, with the rule running
                      out toward the next step. */}
                  <div className="flex items-center gap-3">
                    <span className="font-display text-3xl font-semibold leading-none tabular-nums text-brand-600">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span aria-hidden className="h-px flex-1 bg-[var(--hairline)]" />
                  </div>
                  <h3 className="mt-3.5 font-display text-base font-semibold text-ink-900">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {featured.length > 0 ? (
          <section className="border-t hairline">
            <div className="mx-auto max-w-5xl px-4 py-14">
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <h2 className="text-2xl font-semibold text-ink-900">นัดที่กำลังเปิดรับ</h2>
                <Link
                  href="/discover"
                  className="focus-ring shrink-0 rounded text-sm font-semibold text-brand-700 hover:underline"
                >
                  ดูทั้งหมด →
                </Link>
              </div>
              <p className="mb-6 max-w-xl text-sm leading-relaxed text-ink-600">
                ยังไม่พร้อมลงแข่ง? เริ่มจากนัดประจำก่อนก็ได้ — กลไกเก็บเงินและคืนเงิน
                ชุดเดียวกันกับที่ทัวร์นาเมนต์ใช้
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((session, index) => (
                  <SessionCardLink
                    key={session.id}
                    session={session}
                    counts={counts.get(session.id)}
                    index={index}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="mx-auto max-w-5xl px-4 pb-16 pt-4">
          <Card
            focal
            className="flex flex-wrap items-center justify-between gap-5 px-6 py-7 sm:px-8"
          >
            <div className="max-w-md">
              <h2 className="font-display text-lg font-semibold text-ink-900">
                คุณเป็นเจ้าของสนาม?
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                ลงทะเบียนสนาม จัดการคอร์ตและเวลาทำการ แล้วรับคำขอจองจากนัดในระบบได้เลย
              </p>
            </div>
            <ButtonLink href="/venue" variant="secondary">
              {t.nav.venue}
            </ButtonLink>
          </Card>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
