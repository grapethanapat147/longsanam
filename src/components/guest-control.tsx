'use client';

import { useState, useTransition } from 'react';
import { addGuestAction, removeGuestAction } from '@/lib/actions/participation';
import { Button, Card } from '@/components/ui/primitives';

/**
 * "พี่ต้น +1" — a seat for someone with no account.
 *
 * The organizer says at this moment how the seat is paid, because that is the
 * only moment they know. Cash means they are vouching that they have the money;
 * the RPC logs their id against that claim.
 */
type Props = { sessionId: string; closed: boolean };

export function GuestControl({ sessionId, closed }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (closed) {
    return (
      <Card className="px-5 py-4">
        <h2 className="font-semibold text-ink-900">เพิ่มผู้เล่นรับเชิญ</h2>
        <p className="mt-1 text-sm text-ink-500">ก๊วนนี้ปิดแล้ว เพิ่มคนไม่ได้</p>
      </Card>
    );
  }

  function add(paidCash: boolean) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await addGuestAction(sessionId, name, paidCash);
      if (result.ok) {
        setMessage(`เพิ่ม ${name.trim()} แล้ว`);
        setName('');
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card className="px-5 py-4">
      <h2 className="font-semibold text-ink-900">เพิ่มผู้เล่นรับเชิญ</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-600">
        เพื่อนที่ยังไม่มีบัญชี ลงชื่อแทนได้เลย ระบบจะไม่ทวงเงินและไม่หักเครดิตคนกลุ่มนี้
        เพราะเขาไม่มีบัญชีให้แจ้ง
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs text-ink-500">ชื่อที่ใช้เรียก</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="พี่ต้น"
            className="focus-ring mt-1 w-44 rounded-lg border hairline bg-white px-2 py-1"
          />
        </label>
        <Button size="sm" disabled={pending || name.trim().length === 0} onClick={() => add(true)}>
          รับเงินสดแล้ว
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || name.trim().length === 0}
          onClick={() => add(false)}
        >
          จ่ายทีหลัง
        </Button>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-clay-700">
        เงินสดที่รับไว้เองไม่ได้ผ่านระบบ ถ้าก๊วนถูกยกเลิก ระบบคืนให้ไม่ได้ ต้องคืนเองกับมือ
      </p>

      {message ? <p className="mt-2 text-xs text-brand-700">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-clay-700">{error}</p> : null}
    </Card>
  );
}

/**
 * Removing a guest, shown on the guest's own row.
 *
 * This replaces PayLaterControl for a guest rather than sitting beside it, and
 * that is deliberate. revoke_pay_later() does not read user_id, so it would run
 * on a guest and move the seat to `joined_pending_payment` — a status whose only
 * exit is the player paying in the app, which a guest cannot do. They would then
 * be stuck: payForSlotAction refuses them, grant_pay_later refuses them with
 * `guest_has_no_account`, and the seat still counts against target_players.
 * Removing is the only honest action on a guest seat the organizer wants back.
 */
export function RemoveGuestButton({
  participantId,
  guestName,
  closed,
}: {
  participantId: string;
  guestName: string;
  closed: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (closed) return null;

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeGuestAction(participantId);
      if (result.ok) setConfirming(false);
      else setError(result.error);
    });
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        เอาออก
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <Button variant="danger" size="sm" disabled={pending} onClick={remove}>
          เอา {guestName} ออก
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
          ไม่เอา
        </Button>
      </div>
      <p className="max-w-52 text-right text-xs leading-relaxed text-ink-500">
        ถ้ารับเงินสดไว้แล้ว อย่าลืมคืนเอง ระบบคืนให้ไม่ได้
      </p>
      {error ? <p className="text-xs text-clay-700">{error}</p> : null}
    </div>
  );
}
