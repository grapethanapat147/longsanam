import Link from 'next/link';
import { t } from '@/i18n';
import { getCurrentUser } from '@/lib/auth';
import { loadDiscoverSessions } from '@/lib/queries';
import { SiteFooter, SiteHeader, MockModeBanner } from '@/components/shell';
import { SessionCardLink } from '@/components/session-card';
import { CourtMotif } from '@/components/court-motif';
import { ButtonLink, Card } from '@/components/ui/primitives';

const STEPS = [
  {
    title: 'ตั้งก๊วน',
    body: 'เลือกกีฬา วันเวลา งบต่อคน แล้วจัดลำดับสนามที่ยอมให้ระบบจองได้',
  },
  {
    title: 'แชร์เข้า LINE',
    body: 'ได้ลิงก์เดียวส่งเข้ากลุ่ม เพื่อน ๆ กดเข้าร่วมและจ่ายเงินได้ทันที',
  },
  {
    title: 'ระบบจองสนามให้',
    body: 'พอครบคนและครบยอด ระบบกันคอร์ตและยืนยันเอง สนามแรกเต็มก็ไล่สำรองตามลำดับ',
  },
  {
    title: 'ยกเลิกและคืนเงินเอง',
    body: 'มีคิวสำรองรับช่วงต่อ และคืนเงินตามเงื่อนไขที่ผู้จัดตั้งไว้',
  },
];

/** Three claims the product actually keeps. Stated flatly, no adjectives. */
const PROMISES = [
  ['จ่ายครบ ถึงจอง', 'ไม่ครบยอด ระบบไม่จอง'],
  ['ไม่ได้สนาม คืนเต็ม', 'ทุกบาทที่จ่ายมา'],
  ['คิวสำรองอัตโนมัติ', 'มีคนสละสิทธิ์ ระบบเลื่อนให้'],
];

export default async function LandingPage() {
  const [user, { sessions, counts }] = await Promise.all([
    getCurrentUser(),
    loadDiscoverSessions(),
  ]);

  const featured = sessions.slice(0, 3);

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
            className="pointer-events-none absolute -right-28 -top-32 h-[42rem] w-[20rem] rotate-[14deg] text-brand-700/[0.13] sm:right-0 sm:w-[24rem] lg:right-20"
          >
            <CourtMotif className="h-full w-full" />
          </div>

          <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-14 sm:pt-20">
            <p className="flex items-center gap-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-brand-700">
              <span aria-hidden className="h-px w-7 bg-brand-500" />
              {t.brand.name}
            </p>

            <h1 className="mt-4 max-w-2xl text-[2.4rem] font-semibold leading-[1.15] tracking-tight text-ink-900 sm:text-6xl">
              รวมก๊วน จ่ายเงิน
              <br />
              {/* The one promise, marked like a line painted on the court. */}
              <span className="relative inline-block">
                <span
                  aria-hidden
                  className="absolute inset-x-[-0.12em] bottom-[0.06em] -z-10 h-[0.4em] bg-accent-400"
                />
                ได้สนาม
              </span>{' '}
              จริง ๆ
            </h1>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-600 sm:text-lg">
              ไม่ต้องไล่ทวงเงินในกลุ่ม ไม่ต้องลุ้นว่าจะได้คอร์ตไหม
              ระบบเก็บเงินให้ครบแล้วจองสนามให้เอง
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href={user ? '/organizer/new' : '/auth/sign-up'} size="lg">
                สร้างก๊วนของคุณ
              </ButtonLink>
              <ButtonLink href="/discover" size="lg" variant="secondary">
                {t.nav.discover}
              </ButtonLink>
            </div>

            <dl className="mt-12 grid max-w-xl gap-x-8 gap-y-5 border-t hairline pt-6 sm:grid-cols-3">
              {PROMISES.map(([term, desc]) => (
                <div key={term}>
                  <dt className="font-display text-sm font-semibold text-ink-900">{term}</dt>
                  <dd className="mt-0.5 text-sm text-ink-500">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t hairline bg-white/60">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-2xl font-semibold text-ink-900">ทำงานยังไง</h2>
            <ol className="mt-8 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title}>
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
              <div className="mb-6 flex items-baseline justify-between gap-4">
                <h2 className="text-2xl font-semibold text-ink-900">ก๊วนที่กำลังเปิดรับ</h2>
                <Link
                  href="/discover"
                  className="focus-ring shrink-0 rounded text-sm font-semibold text-brand-700 hover:underline"
                >
                  ดูทั้งหมด →
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((session) => (
                  <SessionCardLink
                    key={session.id}
                    session={session}
                    counts={counts.get(session.id)}
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
                ลงทะเบียนสนาม จัดการคอร์ตและเวลาทำการ แล้วรับคำขอจองจากก๊วนในระบบได้เลย
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
