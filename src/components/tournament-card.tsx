import Link from 'next/link';
import { Card, Chip } from '@/components/ui/primitives';
import { formatDate, formatThb } from '@/lib/format';
import { reasonLabel, t } from '@/i18n';
import type { OpenTournament } from '@/lib/queries';

/**
 * การ์ดทัวร์นาเมนต์บนหน้าค้นหา
 *
 * ลิงก์ไป `/t/<code>` ซึ่งเป็นหน้าสมัครสาธารณะที่มีอยู่แล้ว ไม่ใช่
 * `/app/tournaments/<id>` เพราะหน้านั้นต้องล็อกอินและต้องอยู่ในงานถึงจะอ่านได้
 */
export function TournamentCardLink({ x, index }: { x: OpenTournament; index: number }) {
  const full = x.maxTeams !== null && x.teamCount >= x.maxTeams;

  return (
    <Link href={`/t/${x.publicCode}`} className="focus-ring block rounded-card">
      <Card
        className="rise h-full px-5 py-4 transition hover:border-brand-300"
        style={{ '--i': index } as React.CSSProperties}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-display font-semibold leading-snug text-ink-900">{x.title}</p>
          <Chip tone={full ? 'warning' : 'neutral'}>
            {full ? reasonLabel.tournament_full : `รุ่น ${x.tier}`}
          </Chip>
        </div>

        <p className="mt-1.5 text-sm text-ink-600">
          {formatDate(x.startsAt)} · {formatThb(x.entryFeeThb)} ต่อก๊วน
        </p>

        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t hairline pt-3 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-ink-500">ทีม</dt>
            <dd className="font-medium tabular-nums text-ink-800">
              {t.tournaments.teamCount(x.teamCount, x.minTeams)}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-500">เจ้าภาพ</dt>
            <dd className="font-medium text-ink-800">{x.hostGroupName}</dd>
          </div>
        </dl>

        <p className="mt-2 text-xs text-ink-500">
          {t.tournaments.deadlineHint(formatDate(x.registrationDeadline))}
        </p>
      </Card>
    </Link>
  );
}
