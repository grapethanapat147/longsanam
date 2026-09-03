import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* =========================================================================
 * Loading skeletons.
 *
 * These render the instant a navigation starts, before any data has arrived.
 * Without them the App Router shows the previous page, frozen, until the
 * server responds — which is what "the site feels unresponsive" actually was.
 *
 * They deliberately fetch nothing: a skeleton that awaited the current user
 * would be waiting on the very round-trip it exists to hide.
 * ====================================================================== */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('shimmer rounded-lg bg-ink-200/70', className)} />;
}

export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Mirrors the session card's bones so the grid does not jump when data lands. */
export function SkeletonSessionCard({ index = 0 }: { index?: number }) {
  return (
    <div
      className="rise rounded-card border hairline bg-white px-5 py-4 shadow-line"
      style={{ '--i': index } as React.CSSProperties}
      aria-hidden
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-4/5" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <div className="mt-5 space-y-1.5">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-2 w-full rounded-sm" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

/**
 * A static stand-in for AppShell. The real shell fetches the signed-in user
 * for the header; this one draws the same frame with nothing inside it, so
 * the page structure appears before the network does.
 */
export function SkeletonShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="h-[2.4rem] border-b border-amber-300 bg-amber-100" aria-hidden />
      <div className="sticky top-0 z-30 border-b hairline bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-16" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-24 rounded-xl" />
          </div>
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

export function SkeletonPageHeader() {
  return (
    <div className="mb-7 space-y-2.5" aria-hidden>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}
