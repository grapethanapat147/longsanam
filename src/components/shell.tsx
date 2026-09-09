import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { getPaymentProvider } from '@/lib/payments';
import { getCurrentUser } from '@/lib/auth';
import { AvatarImage } from '@/components/image-upload';
import { Chip, buttonClass } from '@/components/ui/primitives';
import { signOutAction } from '@/lib/actions/auth';

/**
 * Mock-payment notice.
 *
 * Rendered on every authenticated surface whenever the active provider does
 * not move real money. The product requirement is that a demo must never be
 * mistakable for a live transaction, so this is not dismissible.
 */
export function MockModeBanner({ compact = false }: { compact?: boolean }) {
  const provider = getPaymentProvider();
  if (!provider.isMock) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-300 bg-amber-100 px-4 text-amber-950',
        compact ? 'py-1.5 text-xs' : 'py-2 text-sm',
      )}
      role="status"
    >
      <span className="rounded-full bg-amber-500/25 px-2 py-0.5 text-xs font-bold">
        {t.mock.badge}
      </span>
      <span>{compact ? t.mock.short : t.mock.paymentNotice}</span>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-100 hover:text-ink-900 focus-ring"
    >
      {children}
    </Link>
  );
}

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 focus-ring rounded-lg">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-black text-white">
            ลส
          </span>
          <span className="text-base font-bold text-ink-900">{t.brand.name}</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 sm:flex">
          <NavLink href="/discover">{t.nav.discover}</NavLink>
          {user ? (
            <>
              <NavLink href="/app">{t.nav.mySessions}</NavLink>
              <NavLink href="/organizer">{t.organizer.dashboard}</NavLink>
              {(user.role === 'venue_admin' || user.role === 'platform_admin') && (
                <NavLink href="/venue">{t.nav.venue}</NavLink>
              )}
              {user.role === 'platform_admin' && <NavLink href="/admin">{t.nav.admin}</NavLink>}
            </>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:ml-2">
          {user ? (
            <>
              <Link
                href="/app/profile"
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-ink-700 focus-ring"
              >
                <AvatarImage url={user.avatarUrl} displayName={user.displayName} size={28} />
                <span className="hidden max-w-32 truncate sm:block">{user.displayName}</span>
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-100 focus-ring"
                >
                  {t.nav.signOut}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/auth/sign-in"
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 focus-ring"
              >
                {t.nav.signIn}
              </Link>
              <Link
                href="/auth/sign-up"
                className={buttonClass('primary', 'sm')}
              >
                {t.nav.signUp}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile nav: the primary destinations only. */}
      {user ? (
        <nav className="flex gap-1 overflow-x-auto border-t border-ink-200/70 px-3 py-1.5 [&>a]:shrink-0 sm:hidden">
          <NavLink href="/discover">{t.nav.discover}</NavLink>
          <NavLink href="/app">{t.nav.mySessions}</NavLink>
          <NavLink href="/organizer">{t.organizer.dashboard}</NavLink>
          {(user.role === 'venue_admin' || user.role === 'platform_admin') && (
            <NavLink href="/venue">{t.nav.venue}</NavLink>
          )}
          {user.role === 'platform_admin' && <NavLink href="/admin">{t.nav.admin}</NavLink>}
        </nav>
      ) : null}
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MockModeBanner />
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-200/70 px-4 py-6 text-center text-xs text-ink-500">
      <p>
        {t.brand.name} — {t.brand.tagline}
      </p>
      <p className="mt-1">
        <Chip tone="neutral">MVP</Chip>
      </p>
    </footer>
  );
}
