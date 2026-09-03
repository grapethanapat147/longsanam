import Link from 'next/link';
import type { Metadata } from 'next';
import { t } from '@/i18n';
import { SignUpForm } from '@/components/auth-forms';
import { Card } from '@/components/ui/primitives';
import { MockModeBanner } from '@/components/shell';

export const metadata: Metadata = { title: t.auth.signUpTitle };

export default function SignUpPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <MockModeBanner compact />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 focus-ring rounded-lg"
        >
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-sm font-black text-white">
            ลส
          </span>
          <span className="text-lg font-bold text-ink-900">{t.brand.name}</span>
        </Link>

        <Card className="px-6 py-6">
          <h1 className="text-xl font-bold text-ink-900">{t.auth.signUpTitle}</h1>
          <SignUpForm />
        </Card>

        <p className="mt-4 text-center text-sm text-ink-600">
          <Link href="/auth/sign-in" className="font-semibold text-brand-700 hover:underline">
            {t.auth.toSignIn}
          </Link>
        </p>
      </main>
    </div>
  );
}
