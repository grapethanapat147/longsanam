import Link from 'next/link';
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
    <Card className="transition hover:border-brand-300 hover:shadow-md">
      <Link href={`/s/${session.public_code}`} className="block px-5 py-4 focus-ring rounded-card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-500 dark:text-ink-400">
              <span aria-hidden>{session.sports?.emoji ?? '🏅'}</span>
              {session.sports?.name_th ?? 'กีฬา'}
            </p>
            <h3 className="mt-0.5 truncate font-bold text-ink-900 dark:text-white">
              {session.title}
            </h3>
          </div>
          <SessionStatusChip status={session.status} />
        </div>

        <dl className="mt-3 space-y-1 text-sm text-ink-600 dark:text-ink-300">
          <div className="flex gap-2">
            <dt className="sr-only">วันเวลา</dt>
            <dd>
              📅 {formatDate(session.starts_at)} · {formatTimeRange(session.starts_at, session.ends_at)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="sr-only">สถานที่</dt>
            <dd className="truncate">
              📍 {session.area_text}
              {session.district ? ` · ${session.district}` : ''}
            </dd>
          </div>
        </dl>

        <div className="mt-4">
          <Progress
            value={paid}
            max={session.target_players}
            label={`${t.session.paidCount} ${paid} คน${pending > 0 ? ` (รอชำระ ${pending})` : ''}`}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip tone="brand">
            {formatThb(session.budget_per_person_thb)} {t.common.perPerson}
          </Chip>
          {isFull ? (
            <Chip tone="warning">{t.session.full}</Chip>
          ) : (
            <Chip tone="neutral">
              {t.session.slotsLeft} {slotsLeft} {t.common.players}
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
