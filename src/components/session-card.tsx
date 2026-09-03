import Link from 'next/link';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { Card, Chip, Progress } from '@/components/ui/primitives';
import { SessionStatusChip } from '@/components/status';
import { formatDate, formatThb, formatTimeRange } from '@/lib/format';
import { t } from '@/i18n';
import type { SessionCard as SessionCardData, SessionCounts } from '@/lib/queries';

export function SessionCardLink({
  session,
  counts,
}: {
  session: SessionCardData;
  counts?: SessionCounts;
}) {
  const paid = counts?.paid ?? 0;
  const pending = counts?.pending ?? 0;
  const slotsLeft = counts?.slotsLeft ?? 0;
  const isFull = slotsLeft === 0;

  return (
    <Card className="group transition-shadow duration-200 hover:shadow-lift">
      <Link href={`/s/${session.public_code}`} className="focus-ring block rounded-card px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <span aria-hidden>{session.sports?.emoji ?? '🏅'}</span>
              {session.sports?.name_th ?? 'กีฬา'}
            </p>
            {/* Two lines before truncating: the title is what people scan, and
                Thai runs long. */}
            <h3 className="mt-1 line-clamp-2 font-display text-[1.0625rem] font-semibold leading-snug text-ink-900 group-hover:text-brand-700">
              {session.title}
            </h3>
          </div>
          <SessionStatusChip status={session.status} />
        </div>

        {/* Line icons rather than emoji: emoji render at a different weight and
            colour on every platform, which fights the type. */}
        <dl className="mt-3 space-y-1.5 text-sm text-ink-600">
          <div className="flex items-center gap-2">
            <dt className="sr-only">วันเวลา</dt>
            <CalendarDays aria-hidden className="size-4 shrink-0 text-ink-400" />
            <dd className="truncate">
              {formatDate(session.starts_at)} ·{' '}
              {formatTimeRange(session.starts_at, session.ends_at)}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">สถานที่</dt>
            <MapPin aria-hidden className="size-4 shrink-0 text-ink-400" />
            <dd className="truncate">
              {session.area_text}
              {session.district ? ` · ${session.district}` : ''}
            </dd>
          </div>
        </dl>

        <div className="mt-4">
          <Progress
            value={paid}
            max={session.target_players}
            label={`${t.session.paidCount} ${paid} คน${pending > 0 ? ` · รอชำระ ${pending}` : ''}`}
          />
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {/* Price is the number people compare, so it is set as a figure,
              not buried inside a chip. */}
          <span className="font-display text-base font-semibold tabular-nums text-ink-900">
            {formatThb(session.budget_per_person_thb)}
            <span className="ml-1 text-xs font-medium text-ink-500">{t.common.perPerson}</span>
          </span>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--hairline)]" />
          {isFull ? (
            <Chip tone="warning" dot>
              {t.session.full}
            </Chip>
          ) : (
            <Chip tone="neutral">
              <Users aria-hidden className="size-3" />
              {t.session.slotsLeft} {slotsLeft}
            </Chip>
          )}
          {counts && counts.waitlisted > 0 ? (
            <Chip tone="info">
              {t.session.waitlist} {counts.waitlisted}
            </Chip>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}
