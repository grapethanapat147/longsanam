import Link from 'next/link';
import { t } from '@/i18n';
import { getCurrentUser } from '@/lib/auth';
import { loadDiscoverSessions } from '@/lib/queries';
import { SiteFooter, SiteHeader, MockModeBanner } from '@/components/shell';
import { SessionCardLink } from '@/components/session-card';
import { ButtonLink, Card } from '@/components/ui/primitives';

const STEPS = [
  {
    emoji: '📝',
    title: 'ตั้งก๊วน',
    body: 'เลือกกีฬา วันเวลา งบต่อคน และจัดลำดับสนามที่ยอมให้จองได้',
  },
  {
    emoji: '🔗',
    title: 'แชร์เข้า LINE',
    body: 'ได้ลิงก์เดียวส่งเข้ากลุ่ม เพื่อน ๆ กดเข้าร่วมและจ่ายเงินได้ทันที',
  },
  {
    emoji: '🏸',
    title: 'ระบบจองสนามให้',
    body: 'พอครบคนและครบยอด ระบบจะกันคอร์ตและยืนยันให้เอง ถ้าสนามแรกเต็มก็ไล่สนามสำรองตามลำดับ',
  },
  {
    emoji: '💸',
    title: 'ยกเลิกและคืนเงินอัตโนมัติ',
    body: 'มีคิวสำรองรับช่วงต่อ และคืนเงินตามเงื่อนไขที่ผู้จัดตั้งไว้',
  },
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
        <section className="border-b border-ink-200/70 bg-gradient-to-b from-brand-600 to-brand-700 px-4 py-14 text-white dark:border-white/10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-100">
              {t.brand.name}
            </p>
            <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">
              รวมก๊วน จ่ายเงิน ได้สนาม
              <br />
              จบในลิงก์เดียว
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-brand-50">
              ไม่ต้องไล่ทวงเงินในกลุ่ม LINE ไม่ต้องลุ้นว่าจะได้คอร์ตไหม
              ระบบเก็บเงินให้ครบแล้วจองสนามให้อัตโนมัติ
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <ButtonLink
                href={user ? '/organizer/new' : '/auth/sign-up'}
                size="lg"
                className="bg-white text-brand-700 hover:bg-brand-50"
              >
                สร้างก๊วนของคุณ
              </ButtonLink>
              <ButtonLink
                href="/discover"
                size="lg"
                variant="secondary"
                className="border-white/40 bg-white/10 text-white hover:bg-white/20"
              >
                {t.nav.discover}
              </ButtonLink>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-center text-xl font-bold text-ink-900 dark:text-white">
            ทำงานยังไง
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Card className="h-full px-5 py-5">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl" aria-hidden>
                      {step.emoji}
                    </span>
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                      {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-3 font-semibold text-ink-900 dark:text-white">{step.title}</h3>
                  <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{step.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {featured.length > 0 ? (
          <section className="mx-auto max-w-5xl px-4 pb-14">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-xl font-bold text-ink-900 dark:text-white">ก๊วนที่กำลังเปิดรับ</h2>
              <Link
                href="/discover"
                className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
              >
                ดูทั้งหมด
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((session) => (
                <SessionCardLink
                  key={session.id}
                  session={session}
                  counts={counts.get(session.id)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mx-auto max-w-5xl px-4 pb-14">
          <Card className="flex flex-wrap items-center justify-between gap-4 px-6 py-6">
            <div>
              <h2 className="font-bold text-ink-900 dark:text-white">คุณเป็นเจ้าของสนาม?</h2>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                ลงทะเบียนสนาม จัดการคอร์ตและเวลาทำการ แล้วรับคำขอจองจากก๊วนได้เลย
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
