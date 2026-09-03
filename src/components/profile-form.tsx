'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateProfileAction, type ProfileActionState } from '@/lib/actions/profile';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';
import { t } from '@/i18n';

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t.common.loading : t.common.save}
    </Button>
  );
}

export function ProfileForm({
  displayName,
  phone,
  email,
}: {
  displayName: string;
  phone: string;
  email: string;
}) {
  const [state, formAction] = useActionState<ProfileActionState | null, FormData>(
    updateProfileAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="font-semibold text-ink-900">ข้อมูลส่วนตัว</h2>

      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Field label={t.auth.displayName} htmlFor="displayName" required>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          required
          maxLength={60}
        />
      </Field>

      <Field
        label="เบอร์โทรศัพท์"
        htmlFor="phone"
        hint="เห็นได้เฉพาะคุณและผู้ดูแลระบบ ไม่แสดงให้เพื่อนร่วมก๊วน"
      >
        <Input id="phone" name="phone" defaultValue={phone} inputMode="tel" maxLength={20} />
      </Field>

      <Field label={t.auth.email} htmlFor="email" hint="เปลี่ยนอีเมลยังไม่รองรับในเวอร์ชันนี้">
        <Input id="email" defaultValue={email} disabled readOnly />
      </Field>

      <div>
        <SaveButton />
      </div>
    </form>
  );
}
