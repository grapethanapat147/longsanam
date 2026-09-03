'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  manualRefundAction,
  runMaintenanceAction,
  setUserRoleAction,
  setVenueActiveAction,
  type AdminActionState,
} from '@/lib/actions/admin';
import { Alert, Button, Field, Input, Select } from '@/components/ui/primitives';
import { t } from '@/i18n';
import type { AppRole } from '@/lib/domain/types';

export function MaintenanceButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminActionState | null>(null);

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await runMaintenanceAction());
            router.refresh();
          })
        }
      >
        {pending ? t.common.loading : 'รันงานบำรุงรักษาตอนนี้'}
      </Button>
      {result ? (
        <Alert tone={result.ok ? 'success' : 'danger'}>{result.message ?? result.error}</Alert>
      ) : null}
    </div>
  );
}

const ROLES: { value: AppRole; label: string }[] = [
  { value: 'player', label: 'ผู้เล่น' },
  { value: 'venue_admin', label: 'เจ้าของสนาม' },
  { value: 'platform_admin', label: 'ผู้ดูแลระบบ' },
];

export function RoleSelect({
  userId,
  role,
  isSelf,
}: {
  userId: string;
  role: AppRole;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isSelf) {
    return (
      <span className="text-xs text-ink-500" title="ป้องกันการล็อกตัวเองออกจากระบบ">
        {ROLES.find((r) => r.value === role)?.label} (บัญชีคุณเอง)
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        value={role}
        disabled={pending}
        aria-label="เปลี่ยนสิทธิ์"
        className="w-40 py-1.5 text-xs"
        onChange={(event) => {
          const next = event.target.value as AppRole;
          startTransition(async () => {
            const result = await setUserRoleAction(userId, next);
            setError(result.ok ? null : (result.error ?? t.common.unexpectedError));
            router.refresh();
          });
        }}
      >
        {ROLES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

export function VenueActiveToggle({ venueId, isActive }: { venueId: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={isActive ? 'secondary' : 'primary'}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setVenueActiveAction(venueId, !isActive);
            setError(result.ok ? null : (result.error ?? t.common.unexpectedError));
            router.refresh();
          })
        }
      >
        {pending ? t.common.loading : isActive ? 'ปิดสนาม' : 'เปิดสนาม'}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

function RefundSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? t.common.loading : 'บันทึกการคืนเงิน'}
    </Button>
  );
}

/**
 * Dispute support. The amount is validated here, again in the action, and
 * clamped to the original payment inside the database.
 */
export function ManualRefundForm({
  payments,
}: {
  payments: { id: string; label: string; amountThb: number }[];
}) {
  const [state, formAction] = useActionState<AdminActionState | null, FormData>(
    manualRefundAction,
    null,
  );
  const [paymentId, setPaymentId] = useState(payments[0]?.id ?? '');

  const selected = payments.find((p) => p.id === paymentId);

  if (payments.length === 0) {
    return <p className="text-sm text-ink-500">ยังไม่มีรายการชำระเงินที่คืนเงินได้</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Field label="รายการชำระเงิน" htmlFor="paymentId" required>
        <Select
          id="paymentId"
          name="paymentId"
          required
          value={paymentId}
          onChange={(event) => setPaymentId(event.target.value)}
        >
          {payments.map((payment) => (
            <option key={payment.id} value={payment.id}>
              {payment.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="จำนวนเงินที่คืน (บาท)"
        htmlFor="amountThb"
        required
        hint={selected ? `คืนได้สูงสุด ${selected.amountThb} บาท` : undefined}
      >
        <Input
          id="amountThb"
          name="amountThb"
          type="number"
          min={1}
          max={selected?.amountThb}
          required
          defaultValue={selected?.amountThb}
          key={paymentId}
        />
      </Field>

      <Field label="เหตุผล" htmlFor="reason" required hint="จะถูกบันทึกลงในบันทึกการเปลี่ยนสถานะ">
        <Input id="reason" name="reason" required minLength={3} maxLength={300} />
      </Field>

      <div>
        <RefundSubmit />
      </div>
    </form>
  );
}
