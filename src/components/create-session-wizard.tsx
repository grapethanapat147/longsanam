'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createSessionAction, type CreateSessionState } from '@/lib/actions/session';
import {
  Alert,
  Button,
  Card,
  Chip,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatThb } from '@/lib/format';
import { costPerPersonThb } from '@/lib/domain/booking-eligibility';
import { t } from '@/i18n';

type Sport = {
  id: string;
  slug: string;
  name_th: string;
  emoji: string;
  default_players: number;
};

type Court = {
  id: string;
  name: string;
  basePriceThb: number;
  capacity: number;
  venueId: string;
  venueName: string;
  district: string;
  sportIds: string[];
};

const STEPS = [
  t.organizer.stepSport,
  t.organizer.stepWhen,
  t.organizer.stepNumbers,
  t.organizer.stepVenues,
  t.organizer.stepPolicy,
] as const;

function todayPlus(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending || disabled}>
      {pending ? t.common.loading : t.organizer.publish}
    </Button>
  );
}

/**
 * Create-session wizard.
 *
 * All five steps live in one form so the whole draft submits atomically; the
 * step buttons only control which fieldset is visible. Court ranking is held
 * in state and emitted as ordered hidden inputs, because priority is the order
 * the orchestrator will actually try.
 */
export function CreateSessionWizard({ sports, courts }: { sports: Sport[]; courts: Court[] }) {
  const [state, formAction] = useActionState<CreateSessionState | null, FormData>(
    createSessionAction,
    null,
  );

  const [step, setStep] = useState(0);
  const [sportId, setSportId] = useState(sports[0]?.id ?? '');
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [targetPlayers, setTargetPlayers] = useState(sports[0]?.default_players ?? 8);
  const [minPlayers, setMinPlayers] = useState(Math.max(2, (sports[0]?.default_players ?? 8) - 2));
  const [budget, setBudget] = useState(100);

  const eligibleCourts = useMemo(
    () => courts.filter((court) => court.sportIds.includes(sportId)),
    [courts, sportId],
  );

  const selectedCourts = useMemo(
    () =>
      selectedCourtIds
        .map((id) => eligibleCourts.find((c) => c.id === id))
        .filter((c): c is Court => Boolean(c)),
    [selectedCourtIds, eligibleCourts],
  );

  const cheapest = selectedCourts.reduce<number | null>(
    (min, c) => (min === null ? c.basePriceThb : Math.min(min, c.basePriceThb)),
    null,
  );

  function toggleCourt(id: string) {
    setSelectedCourtIds((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
  }

  function move(id: string, direction: -1 | 1) {
    setSelectedCourtIds((current) => {
      const index = current.indexOf(id);
      const next = index + direction;
      if (index === -1 || next < 0 || next >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }

  const fieldError = (key: string) => state?.fieldErrors?.[key];

  return (
    <form action={formAction} className="space-y-5">
      <ol className="flex flex-wrap gap-2" aria-label="ขั้นตอน">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
              aria-current={step === index ? 'step' : undefined}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition focus-ring',
                step === index
                  ? 'bg-brand-600 text-white'
                  : 'border border-ink-300 bg-white text-ink-600 hover:bg-ink-50',
              )}
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {/* Step 1 — sport */}
      <Card className={cn('px-5 py-5', step !== 0 && 'hidden')}>
        <h2 className="font-semibold text-ink-900">{t.organizer.stepSport}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sports.map((sport) => (
            <label
              key={sport.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition',
                sportId === sport.id
                  ? 'border-brand-500 bg-brand-50 font-semibold text-brand-800'
                  : 'border-ink-300 hover:bg-ink-50',
              )}
            >
              <input
                type="radio"
                name="sportId"
                value={sport.id}
                checked={sportId === sport.id}
                onChange={() => {
                  setSportId(sport.id);
                  setTargetPlayers(sport.default_players);
                  setMinPlayers(Math.max(2, sport.default_players - 2));
                  setSelectedCourtIds([]);
                }}
                className="sr-only"
              />
              <span aria-hidden>{sport.emoji}</span>
              {sport.name_th}
            </label>
          ))}
        </div>
        {fieldError('sportId') ? (
          <p className="mt-2 text-xs text-red-600">{fieldError('sportId')}</p>
        ) : null}
        <StepNav onNext={() => setStep(1)} />
      </Card>

      {/* Step 2 — when and where */}
      <Card className={cn('space-y-4 px-5 py-5', step !== 1 && 'hidden')}>
        <h2 className="font-semibold text-ink-900">{t.organizer.stepWhen}</h2>

        <Field label="ชื่อก๊วน" htmlFor="title" required error={fieldError('title')}>
          <Input
            id="title"
            name="title"
            required
            maxLength={120}
            placeholder="เช่น ก๊วนแบดเย็นวันพุธ"
          />
        </Field>

        <Field label="รายละเอียด" htmlFor="description" hint="บอกระดับฝีมือ หรือสิ่งที่ต้องเตรียม">
          <Textarea id="description" name="description" maxLength={500} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ย่าน/พื้นที่" htmlFor="areaText" required error={fieldError('areaText')}>
            <Input id="areaText" name="areaText" required placeholder="เช่น ลาดพร้าว" />
          </Field>
          <Field label="เขต/อำเภอ" htmlFor="district">
            <Input id="district" name="district" placeholder="เช่น วังทองหลาง" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="วันที่เล่น" htmlFor="date" required error={fieldError('date')}>
            <Input id="date" name="date" type="date" required defaultValue={todayPlus(7)} />
          </Field>
          <Field label="เวลาเริ่ม" htmlFor="startTime" required>
            <Input id="startTime" name="startTime" type="time" required defaultValue="19:00" />
          </Field>
          <Field label="เวลาสิ้นสุด" htmlFor="endTime" required error={fieldError('endTime')}>
            <Input id="endTime" name="endTime" type="time" required defaultValue="21:00" />
          </Field>
        </div>

        <StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} />
      </Card>

      {/* Step 3 — numbers */}
      <Card className={cn('space-y-4 px-5 py-5', step !== 2 && 'hidden')}>
        <h2 className="font-semibold text-ink-900">{t.organizer.stepNumbers}</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="จำนวนเป้าหมาย" htmlFor="targetPlayers" required>
            <Input
              id="targetPlayers"
              name="targetPlayers"
              type="number"
              min={2}
              max={60}
              required
              value={targetPlayers}
              onChange={(e) => setTargetPlayers(Number(e.target.value))}
            />
          </Field>
          <Field
            label="จำนวนขั้นต่ำ"
            htmlFor="minPlayers"
            required
            error={fieldError('minPlayers')}
            hint="ระบบจะจองสนามเมื่อชำระเงินครบตามจำนวนนี้"
          >
            <Input
              id="minPlayers"
              name="minPlayers"
              type="number"
              min={1}
              max={60}
              required
              value={minPlayers}
              onChange={(e) => setMinPlayers(Number(e.target.value))}
            />
          </Field>
          <Field label="งบต่อคน (บาท)" htmlFor="budgetPerPersonThb" required>
            <Input
              id="budgetPerPersonThb"
              name="budgetPerPersonThb"
              type="number"
              min={0}
              required
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="วันปิดรับชำระ"
            htmlFor="paymentDeadlineDate"
            required
            error={fieldError('paymentDeadlineDate')}
          >
            <Input
              id="paymentDeadlineDate"
              name="paymentDeadlineDate"
              type="date"
              required
              defaultValue={todayPlus(6)}
            />
          </Field>
          <Field label="เวลาปิดรับชำระ" htmlFor="paymentDeadlineTime" required>
            <Input
              id="paymentDeadlineTime"
              name="paymentDeadlineTime"
              type="time"
              required
              defaultValue="20:00"
            />
          </Field>
        </div>

        <Alert tone="info">
          เก็บได้สูงสุด {formatThb(budget * targetPlayers)} เมื่อครบ {targetPlayers} คน · เมื่อครบ
          ขั้นต่ำ {minPlayers} คน จะเก็บได้ {formatThb(budget * minPlayers)}
          {cheapest !== null
            ? ` · ค่าสนามถูกที่สุดที่เลือกไว้ ${formatThb(cheapest)} (${formatThb(costPerPersonThb(cheapest, minPlayers))}/คน)`
            : ''}
        </Alert>

        <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} />
      </Card>

      {/* Step 4 — venues */}
      <Card className={cn('space-y-4 px-5 py-5', step !== 3 && 'hidden')}>
        <h2 className="font-semibold text-ink-900">{t.organizer.stepVenues}</h2>
        <p className="text-sm text-ink-600">{t.session.fallbackNote}</p>

        {eligibleCourts.length === 0 ? (
          <Alert tone="warning">
            ยังไม่มีคอร์ตที่รองรับกีฬานี้ในระบบ กรุณาเลือกกีฬาอื่น หรือชวนเจ้าของสนามมาลงทะเบียน
          </Alert>
        ) : (
          <div className="space-y-2">
            {eligibleCourts.map((court) => {
              const index = selectedCourtIds.indexOf(court.id);
              const selected = index !== -1;
              return (
                <div
                  key={court.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition',
                    selected ? 'border-brand-500 bg-brand-50' : 'border-ink-300',
                  )}
                >
                  <input
                    type="checkbox"
                    id={`court-${court.id}`}
                    checked={selected}
                    onChange={() => toggleCourt(court.id)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  <label htmlFor={`court-${court.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {court.venueName} · {court.name}
                    </p>
                    <p className="text-xs text-ink-500">
                      {court.district} · {formatThb(court.basePriceThb)}/ชม. · รองรับ{' '}
                      {court.capacity} คน
                    </p>
                  </label>
                  {selected ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Chip tone="brand">ลำดับ {index + 1}</Chip>
                      <button
                        type="button"
                        onClick={() => move(court.id, -1)}
                        disabled={index === 0}
                        aria-label="เลื่อนขึ้น"
                        className="rounded px-1.5 py-0.5 text-xs disabled:opacity-30 hover:bg-ink-100"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => move(court.id, 1)}
                        disabled={index === selectedCourtIds.length - 1}
                        aria-label="เลื่อนลง"
                        className="rounded px-1.5 py-0.5 text-xs disabled:opacity-30 hover:bg-ink-100"
                      >
                        ▼
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {selectedCourtIds.map((id) => (
          <input key={id} type="hidden" name="courtIds" value={id} />
        ))}

        {fieldError('courtIds') ? (
          <p className="text-xs text-red-600">{fieldError('courtIds')}</p>
        ) : null}

        <StepNav onBack={() => setStep(2)} onNext={() => setStep(4)} />
      </Card>

      {/* Step 5 — policy */}
      <Card className={cn('space-y-4 px-5 py-5', step !== 4 && 'hidden')}>
        <h2 className="font-semibold text-ink-900">{t.organizer.stepPolicy}</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="คืนเต็มถ้ายกเลิกก่อน (ชม.)" htmlFor="fullRefundHoursBefore" required>
            <Input
              id="fullRefundHoursBefore"
              name="fullRefundHoursBefore"
              type="number"
              min={0}
              max={720}
              required
              defaultValue={48}
            />
          </Field>
          <Field
            label="คืนบางส่วนถ้ายกเลิกก่อน (ชม.)"
            htmlFor="partialRefundHoursBefore"
            required
            error={fieldError('partialRefundHoursBefore')}
          >
            <Input
              id="partialRefundHoursBefore"
              name="partialRefundHoursBefore"
              type="number"
              min={0}
              max={720}
              required
              defaultValue={24}
            />
          </Field>
          <Field label="คืนบางส่วนกี่ %" htmlFor="partialRefundPercent" required>
            <Select id="partialRefundPercent" name="partialRefundPercent" defaultValue="50">
              {[0, 25, 50, 75].map((percent) => (
                <option key={percent} value={percent}>
                  {percent}%
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="organizerCancelAlwaysFullRefund"
            defaultChecked
            className="mt-1 h-4 w-4 accent-brand-600"
          />
          <span>
            ถ้าผู้จัดยกเลิกก๊วน หรือระบบจองสนามไม่สำเร็จ คืนเงินผู้เล่นเต็มจำนวนทุกกรณี
            <span className="block text-xs text-ink-500">
              แนะนำให้เปิดไว้ เพราะผู้เล่นไม่ได้เป็นฝ่ายผิดในกรณีนี้
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-4">
          <Button type="button" variant="ghost" onClick={() => setStep(3)}>
            {t.common.back}
          </Button>
          <SubmitButton disabled={selectedCourtIds.length === 0} />
          {selectedCourtIds.length === 0 ? (
            <p className="text-xs text-ink-500">
              ต้องเลือกสนามอย่างน้อย 1 แห่งในขั้นตอนที่ 4 ก่อนจึงจะสร้างก๊วนได้
            </p>
          ) : (
            <p className="text-xs text-ink-500">
              ก๊วนจะถูกสร้างเป็นฉบับร่าง คุณจะกดเผยแพร่เองในหน้าถัดไป
            </p>
          )}
        </div>
      </Card>
    </form>
  );
}

function StepNav({ onBack, onNext }: { onBack?: () => void; onNext?: () => void }) {
  return (
    <div className="mt-5 flex justify-between gap-2 border-t border-ink-200 pt-4">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          {t.common.back}
        </Button>
      ) : (
        <span />
      )}
      {onNext ? (
        <Button type="button" variant="secondary" onClick={onNext}>
          {t.common.next}
        </Button>
      ) : null}
    </div>
  );
}
