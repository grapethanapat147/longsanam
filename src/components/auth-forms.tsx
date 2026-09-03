'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInAction, signUpAction, type ActionState } from '@/lib/actions/auth';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';
import { t } from '@/i18n';

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * LINE sign-in.
 *
 * Rendered as a genuinely disabled control with the reason shown, rather than
 * a button that looks live and does nothing. It becomes available the moment
 * a LINE channel is configured.
 */
function LineSignInPlaceholder() {
  return (
    <div className="mt-4 border-t border-ink-200 pt-4">
      <button
        type="button"
        disabled
        title={t.auth.lineNotConfigured}
        className="w-full rounded-xl border border-ink-300 bg-ink-50 px-4 py-2.5 text-sm font-semibold text-ink-400"
      >
        {t.auth.lineSoon}
      </button>
      <p className="mt-1.5 text-xs text-ink-500">{t.auth.lineNotConfigured}</p>
    </div>
  );
}

const DEMO_ACCOUNTS = [
  { email: 'organizer@longsanam.test', role: 'ผู้จัดก๊วน' },
  { email: 'player1@longsanam.test', role: 'ผู้เล่น' },
  { email: 'venue@longsanam.test', role: 'เจ้าของสนาม' },
  { email: 'admin@longsanam.test', role: 'ผู้ดูแลระบบ' },
];

function DemoAccounts() {
  return (
    <details className="mt-4 rounded-xl border border-ink-200 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-ink-700">{t.auth.demoAccounts}</summary>
      <ul className="mt-2 space-y-1 text-xs text-ink-600">
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.email} className="flex justify-between gap-2">
            <code className="font-mono">{account.email}</code>
            <span className="shrink-0 text-ink-500">{account.role}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-500">
        รหัสผ่านทุกบัญชี: <code className="font-mono">password123</code>
      </p>
    </details>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<ActionState | null, FormData>(signInAction, null);

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-4">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="next" value={next ?? '/app'} />

      <Field label={t.auth.email} htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </Field>

      <Field label={t.auth.password} htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
        />
      </Field>

      <SubmitButton label={t.auth.signInCta} pendingLabel={t.common.loading} />
      <LineSignInPlaceholder />
      <DemoAccounts />
    </form>
  );
}

export function SignUpForm() {
  const [state, formAction] = useActionState<ActionState | null, FormData>(signUpAction, null);

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-4">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field
        label={t.auth.displayName}
        htmlFor="displayName"
        required
        hint="ชื่อที่เพื่อนในก๊วนจะเห็น"
      >
        <Input
          id="displayName"
          name="displayName"
          required
          maxLength={60}
          placeholder="เช่น ก้อง"
        />
      </Field>

      <Field label={t.auth.email} htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label={t.auth.password} htmlFor="password" required hint={t.auth.passwordTooShort}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
        />
      </Field>

      <SubmitButton label={t.auth.signUpCta} pendingLabel={t.common.loading} />
      <LineSignInPlaceholder />
    </form>
  );
}
