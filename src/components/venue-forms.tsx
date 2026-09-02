'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  blockCourtSlotAction,
  createVenueAction,
  decideBookingAction,
  removeBlockAction,
  setAutoConfirmAction,
  setOpeningHoursAction,
  upsertCourtAction,
  type VenueActionState,
} from '@/lib/actions/venue';
import { Alert, Button, Card, Field, Input, Select } from '@/components/ui/primitives';
import { t } from '@/i18n';

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t.common.loading : label}
    </Button>
  );
}

export function VenueOnboardingForm() {
  const [state, formAction] = useActionState<VenueActionState | null, FormData>(
    createVenueAction,
    null,
  );
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  // Suggest a slug from the name until the operator types their own.
  function handleName(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(
        value
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .slice(0, 50),
      );
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="ชื่อสนาม" htmlFor="name" required error={state?.fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          value={name}
          onChange={(event) => handleName(event.target.value)}
          placeholder="เช่น ลาดพร้าว แบดมินตัน เซ็นเตอร์"
        />
      </Field>

      <Field
        label="ชื่อย่อสำหรับลิงก์"
        htmlFor="slug"
        required
        error={state?.fieldErrors?.slug}
        hint="ใช้ได้เฉพาะ a-z, 0-9 และ - เช่น ladprao-badminton"
      >
        <Input
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
          placeholder="ladprao-badminton"
        />
      </Field>

      <Field label="ที่อยู่" htmlFor="address" required error={state?.fieldErrors?.address}>
        <Input id="address" name="address" required maxLength={200} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="เขต/อำเภอ" htmlFor="district" required error={state?.fieldErrors?.district}>
          <Input id="district" name="district" required placeholder="เช่น วังทองหลาง" />
        </Field>
        <Field label="จังหวัด" htmlFor="province" required>
          <Input id="province" name="province" required defaultValue="กรุงเทพมหานคร" />
        </Field>
      </div>

      <Field label="เบอร์ติดต่อ" htmlFor="phone">
        <Input id="phone" name="phone" inputMode="tel" maxLength={30} />
      </Field>

      <Field label="รายละเอียดสนาม" htmlFor="description">
        <Input id="description" name="description" maxLength={500} />
      </Field>

      <div>
        <SubmitButton label="ลงทะเบียนสนาม" />
      </div>
    </form>
  );
}

export function CourtForm({
  venueId,
  sports,
  court,
}: {
  venueId: string;
  sports: { id: string; name_th: string; emoji: string }[];
  court?: {
    id: string;
    name: string;
    capacity: number;
    base_price_thb: number;
    min_booking_minutes: number;
    is_active: boolean;
    sportIds: string[];
  };
}) {
  const [state, formAction] = useActionState<VenueActionState | null, FormData>(
    upsertCourtAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="venueId" value={venueId} />
      {court ? <input type="hidden" name="courtId" value={court.id} /> : null}

      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">บันทึกคอร์ตเรียบร้อยแล้ว</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ชื่อคอร์ต" htmlFor={`name-${court?.id ?? 'new'}`} required>
          <Input
            id={`name-${court?.id ?? 'new'}`}
            name="name"
            required
            defaultValue={court?.name}
            placeholder="เช่น คอร์ต 1"
          />
        </Field>
        <Field label="ราคาต่อชั่วโมง (บาท)" htmlFor={`price-${court?.id ?? 'new'}`} required>
          <Input
            id={`price-${court?.id ?? 'new'}`}
            name="basePriceThb"
            type="number"
            min={0}
            required
            defaultValue={court?.base_price_thb ?? 200}
          />
        </Field>
        <Field label="รองรับผู้เล่น (คน)" htmlFor={`capacity-${court?.id ?? 'new'}`} required>
          <Input
            id={`capacity-${court?.id ?? 'new'}`}
            name="capacity"
            type="number"
            min={1}
            required
            defaultValue={court?.capacity ?? 4}
          />
        </Field>
        <Field label="จองขั้นต่ำ (นาที)" htmlFor={`min-${court?.id ?? 'new'}`} required>
          <Input
            id={`min-${court?.id ?? 'new'}`}
            name="minBookingMinutes"
            type="number"
            min={15}
            step={15}
            required
            defaultValue={court?.min_booking_minutes ?? 60}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink-800 dark:text-ink-100">กีฬาที่รองรับ</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {sports.map((sport) => (
            <label
              key={sport.id}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-300 px-2.5 py-1.5 text-sm dark:border-white/15"
            >
              <input
                type="checkbox"
                name="sportIds"
                value={sport.id}
                defaultChecked={court?.sportIds.includes(sport.id)}
                className="h-4 w-4 accent-brand-600"
              />
              <span aria-hidden>{sport.emoji}</span>
              {sport.name_th}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={court?.is_active ?? true}
          className="h-4 w-4 accent-brand-600"
        />
        เปิดให้จอง
      </label>

      <div>
        <SubmitButton label={court ? t.common.save : 'เพิ่มคอร์ต'} />
      </div>
    </form>
  );
}

export function OpeningHoursForm({
  venueId,
  courtId,
  current,
}: {
  venueId: string;
  courtId: string;
  current: { weekday: number; opens_at: string; closes_at: string }[];
}) {
  const [state, formAction] = useActionState<VenueActionState | null, FormData>(
    setOpeningHoursAction,
    null,
  );

  const openWeekdays = new Set(current.map((row) => row.weekday));
  const first = current[0];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="courtId" value={courtId} />

      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">บันทึกเวลาทำการแล้ว</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="เปิด" htmlFor={`opens-${courtId}`} required>
          <Input
            id={`opens-${courtId}`}
            name="opensAt"
            type="time"
            required
            defaultValue={first?.opens_at?.slice(0, 5) ?? '06:00'}
          />
        </Field>
        <Field label="ปิด" htmlFor={`closes-${courtId}`} required>
          <Input
            id={`closes-${courtId}`}
            name="closesAt"
            type="time"
            required
            defaultValue={first?.closes_at?.slice(0, 5) ?? '23:00'}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink-800 dark:text-ink-100">วันที่เปิด</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {WEEKDAYS.map((label, weekday) => (
            <label
              key={weekday}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-300 px-2 py-1 text-xs dark:border-white/15"
            >
              <input
                type="checkbox"
                name="weekdays"
                value={weekday}
                defaultChecked={openWeekdays.has(weekday)}
                className="h-3.5 w-3.5 accent-brand-600"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <SubmitButton label="บันทึกเวลาทำการ" />
      </div>
    </form>
  );
}

export function BlockSlotForm({
  venueId,
  courts,
}: {
  venueId: string;
  courts: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<VenueActionState | null, FormData>(
    blockCourtSlotAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="venueId" value={venueId} />

      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">ปิดคอร์ตช่วงเวลานี้เรียบร้อยแล้ว</Alert> : null}

      <Field label="คอร์ต" htmlFor="blockCourt" required>
        <Select id="blockCourt" name="courtId" required>
          {courts.map((court) => (
            <option key={court.id} value={court.id}>
              {court.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="ประเภท" htmlFor="blockKind" required>
        <Select id="blockKind" name="kind" defaultValue="manual_block">
          <option value="manual_block">ปิดชั่วคราว</option>
          <option value="blackout">ปิดปรับปรุง</option>
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="วันที่" htmlFor="blockDate" required>
          <Input id="blockDate" name="date" type="date" required />
        </Field>
        <Field label="ตั้งแต่" htmlFor="blockStart" required>
          <Input id="blockStart" name="startTime" type="time" required defaultValue="09:00" />
        </Field>
        <Field label="ถึง" htmlFor="blockEnd" required>
          <Input id="blockEnd" name="endTime" type="time" required defaultValue="12:00" />
        </Field>
      </div>

      <Field label="เหตุผล" htmlFor="blockReason">
        <Input id="blockReason" name="reason" maxLength={200} placeholder="เช่น ซ่อมพื้นคอร์ต" />
      </Field>

      <div>
        <SubmitButton label={t.venue.blockSlot} />
      </div>
    </form>
  );
}

export function RemoveBlockButton({ blockId, venueId }: { blockId: string; venueId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeBlockAction(blockId, venueId);
            if (!result.ok) setError(result.error ?? t.common.unexpectedError);
            router.refresh();
          })
        }
      >
        {pending ? t.common.loading : 'เปิดคอร์ตอีกครั้ง'}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

export function BookingDecisionButtons({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );

  function decide(approve: boolean) {
    startTransition(async () => {
      const result = await decideBookingAction(bookingId, approve, reason.trim() || undefined);
      setFeedback(
        result.ok
          ? { tone: 'success', text: approve ? 'ยืนยันการจองแล้ว' : 'ปฏิเสธคำขอแล้ว' }
          : { tone: 'danger', text: result.error ?? t.common.unexpectedError },
      );
      setShowReject(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}

      {showReject ? (
        <div className="flex flex-col gap-2">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เหตุผลที่ปฏิเสธ (แจ้งผู้จัดก๊วน)"
            maxLength={200}
          />
          <div className="flex gap-2">
            <Button variant="danger" size="sm" disabled={pending} onClick={() => decide(false)}>
              {pending ? t.common.loading : 'ยืนยันการปฏิเสธ'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowReject(false)}>
              {t.common.back}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => decide(true)}>
            {pending ? t.common.loading : t.venue.approve}
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setShowReject(true)}>
            {t.venue.reject}
          </Button>
        </div>
      )}
    </div>
  );
}

export function AutoConfirmToggle({
  venueId,
  enabled,
}: {
  venueId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-ink-900 dark:text-white">{t.venue.autoConfirm}</h3>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            {enabled
              ? 'คำขอจองจะถูกยืนยันทันทีเมื่อคอร์ตว่าง ก๊วนจะได้สนามโดยไม่ต้องรอคุณ'
              : 'คำขอจองจะเข้ามารอในกล่องคำขอ และคอร์ตจะถูกกันไว้จนกว่าคุณจะตอบ'}
          </p>
        </div>
        <Button
          variant={enabled ? 'secondary' : 'primary'}
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setAutoConfirmAction(venueId, !enabled);
              if (!result.ok) setError(result.error ?? t.common.unexpectedError);
              router.refresh();
            })
          }
        >
          {pending ? t.common.loading : enabled ? 'ปิด' : 'เปิด'}
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </Card>
  );
}
