import type { Metadata } from 'next';
import Link from 'next/link';
import { t } from '@/i18n';
import { loadDiscoverSessions, loadOpenTournaments, loadSports } from '@/lib/queries';
import { AppShell } from '@/components/shell';
import { SessionCardLink } from '@/components/session-card';
import { TournamentCardLink } from '@/components/tournament-card';
import { EmptyState, PageHeader, ButtonLink } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: t.nav.discover };

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string; type?: string }>;
}) {
  const { sport, type } = await searchParams;

  // แท็บเป็น allowlist — ค่าที่ไม่รู้จักตกกลับมาที่ "นัด" แทนที่จะได้หน้าว่าง
  const showTournaments = type === 'tournaments';

  const [{ sessions, counts }, sports, tournaments] = await Promise.all([
    loadDiscoverSessions({ sport }),
    loadSports(),
    showTournaments ? loadOpenTournaments() : Promise.resolve([]),
  ]);

  return (
    <AppShell>
      <PageHeader
        /* ป้ายเมนูยังเป็น "หานัด" เหมือนเดิม แต่หัวข้อบนหน้าต้องตรงกับแท็บที่เปิดอยู่
           ไม่งั้นหัวข้อบอกว่าหานัด แล้วคำอธิบายใต้หัวข้อบอกว่าทัวร์นาเมนต์ */
        title={showTournaments ? 'หาทัวร์นาเมนต์' : t.nav.discover}
        description={
          showTournaments
            ? 'ทัวร์นาเมนต์ที่ยังเปิดรับสมัครก๊วน'
            : 'นัดที่กำลังเปิดรับผู้เล่นในช่วงนี้'
        }
        action={
          <ButtonLink href={showTournaments ? '/app/tournaments/new' : '/organizer/new'}>
            {showTournaments ? t.tournaments.create : t.nav.create}
          </ButtonLink>
        }
      />

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="เลือกสิ่งที่จะหา">
        <FilterChip href="/discover" active={!showTournaments} label={t.nav.discover} />
        <FilterChip
          href="/discover?type=tournaments"
          active={showTournaments}
          label={t.nav.tournaments}
        />
      </nav>

      {/* เหลือกีฬาเดียว ตัวกรองก็ไม่มีอะไรให้กรอง — "ทั้งหมด" กับ "แบดมินตัน"
          หมายถึงชุดเดียวกันเป๊ะ ซ่อนไปทั้งแถบดีกว่าปล่อยให้เป็นปุ่มหลอก (LSN-0033) */}
      {sports.length > 1 ? (
        <nav className="mb-5 flex flex-wrap gap-2" aria-label="กรองตามกีฬา">
          <FilterChip href="/discover" active={!sport} label="ทั้งหมด" />
          {sports.map((s) => (
            <FilterChip
              key={s.id}
              href={`/discover?sport=${s.slug}`}
              active={sport === s.slug}
              label={`${s.emoji} ${s.name_th}`}
            />
          ))}
        </nav>
      ) : null}

      {showTournaments ? (
        tournaments.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="ยังไม่มีทัวร์นาเมนต์ที่เปิดรับสมัคร"
            description="เปิดของก๊วนคุณเองได้เลย แล้วส่งลิงก์ชวนก๊วนอื่นเข้ามาแข่ง"
            action={
              <ButtonLink href="/app/tournaments/new">{t.tournaments.create}</ButtonLink>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((x, index) => (
              <TournamentCardLink key={x.publicCode} x={x} index={index} />
            ))}
          </div>
        )
      ) : sessions.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={t.session.noSessions}
          description="ลองเปลี่ยนกีฬาที่กรอง หรือเริ่มตั้งนัดของคุณเอง แล้วชวนเพื่อนเข้ามา"
          action={<ButtonLink href="/organizer/new">{t.nav.create}</ButtonLink>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session, index) => (
            <SessionCardLink
              key={session.id}
              session={session}
              counts={counts.get(session.id)}
              index={index}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full px-3 py-1.5 text-sm font-medium transition focus-ring',
        active
          ? 'bg-brand-500 text-on-brand'
          : 'border border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      {label}
    </Link>
  );
}
