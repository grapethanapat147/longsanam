'use client';

import { useState, useTransition } from 'react';
import { setCheckInAction } from '@/lib/actions/participation';
import { checkInWindow } from '@/lib/domain/credit';
import { Button } from '@/components/ui/primitives';

/**
 * The organizer marks who turned up, one tap per name.
 *
 * Outside the window the button stays visible but disabled with its reason —
 * an organizer who cannot find the control learns nothing about why.
 */
type Props = {
  participantId: string;
  checkedInAt: string | null;
  startsAt: string;
  endsAt: string;
};

export function CheckInControl({ participantId, checkedInAt, startsAt, endsAt }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const window = checkInWindow(new Date(startsAt), new Date(endsAt));
  const now = new Date();
  const present = Boolean(checkedInAt);

  if (!window.isOpenAt(now)) {
    return (
      <div className="flex flex-col items-end gap-1 text-right">
        <Button variant="secondary" size="sm" disabled>
          {present ? 'มาแล้ว' : 'เช็คอิน'}
        </Button>
        <p className="text-xs text-ink-500">
          {now < window.opensAt ? 'ยังไม่ถึงเวลาเช็คอิน' : 'ปิดรับเช็คอินแล้ว'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <Button
        variant={present ? 'primary' : 'secondary'}
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setCheckInAction(participantId, !present);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {present ? 'มาแล้ว' : 'เช็คอิน'}
      </Button>
      {error ? <p className="text-xs text-clay-700">{error}</p> : null}
    </div>
  );
}
