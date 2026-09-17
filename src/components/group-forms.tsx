'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  archiveGroupAction,
  createGroupAction,
  joinGroupAction,
  leaveGroupAction,
} from '@/lib/actions/group';
import { Button, Card, Field, Input, Select } from '@/components/ui/primitives';
import { t } from '@/i18n';

export function CreateGroupForm({ sports }: { sports: { id: string; name_th: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sportId, setSportId] = useState(sports[0]?.id ?? '');
  const [district, setDistrict] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createGroupAction(name, sportId, district);
      if (!result.ok) return setError(result.error);
      router.push(`/app/groups/${result.groupId}`);
    });
  }

  return (
    <Card className="px-5 py-4">
      <p className="font-medium text-ink-800">{t.groups.createTitle}</p>

      <Field label={t.groups.nameField} htmlFor="group-name">
        <Input
          id="group-name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label={t.groups.sportField} htmlFor="group-sport">
        <Select id="group-sport" value={sportId} onChange={(e) => setSportId(e.target.value)}>
          {sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name_th}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t.groups.districtField} htmlFor="group-district">
        <Input id="group-district" value={district} onChange={(e) => setDistrict(e.target.value)} />
      </Field>

      {error ? <p className="mt-2 text-sm text-clay-700">{error}</p> : null}

      <Button
        type="button"
        onClick={submit}
        disabled={pending || name.trim().length === 0 || !sportId}
        className="mt-3 w-full"
      >
        {t.groups.create}
      </Button>
    </Card>
  );
}

export function JoinGroupButton({ code }: { code: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function join() {
    setError(null);
    startTransition(async () => {
      const result = await joinGroupAction(code);
      if (!result.ok) return setError(result.error);
      router.push(`/app/groups/${result.groupId}`);
    });
  }

  return (
    <>
      {error ? <p className="mb-2 text-sm text-clay-700">{error}</p> : null}
      <Button type="button" onClick={join} disabled={pending} className="w-full">
        {t.groups.joinCta}
      </Button>
    </>
  );
}

/**
 * ปุ่มออก/ปิดก๊วน
 *
 * เจ้าของไม่เห็นปุ่ม "ออกจากก๊วน" เลย แทนที่จะเห็นแล้วกดไม่ได้ เพราะกติกานี้
 * ไม่ใช่เงื่อนไขชั่วคราว มันจริงเสมอสำหรับเจ้าของ — ปุ่มที่ไม่มีวันกดได้
 * ไม่ควรมีอยู่ ส่วนกติกาตัวจริงบังคับที่ RPC ไม่ใช่ที่นี่
 */
export function GroupControls({
  groupId,
  isOwner,
  archived,
}: {
  groupId: string;
  isOwner: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after: string) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error ?? null);
      router.push(after);
    });
  }

  if (archived) return null;

  return (
    <Card className="px-5 py-4">
      {error ? <p className="mb-2 text-sm text-clay-700">{error}</p> : null}

      {isOwner ? (
        <>
          <p className="text-sm text-ink-500">{t.groups.ownerCannotLeaveHint}</p>
          <p className="mt-3 text-sm text-ink-500">{t.groups.archiveHint}</p>
          <Button
            type="button"
            onClick={() => run(() => archiveGroupAction(groupId), '/app/groups')}
            disabled={pending}
            className="mt-2 w-full"
          >
            {t.groups.archive}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          onClick={() => run(() => leaveGroupAction(groupId), '/app/groups')}
          disabled={pending}
          className="w-full"
        >
          {t.groups.leave}
        </Button>
      )}
    </Card>
  );
}
