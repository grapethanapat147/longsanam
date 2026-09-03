import { Skeleton, SkeletonShell, SkeletonText } from '@/components/ui/skeleton';

/**
 * Matches the session page's real layout — header spanning the top, then the
 * action rail and the detail column — so nothing shifts when data arrives.
 */
export default function SessionLoading() {
  return (
    <SkeletonShell>
      <div className="mb-6 space-y-3" aria-hidden>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <Skeleton className="h-9 w-3/4 max-w-md" />
        <Skeleton className="h-4 w-1/2 max-w-sm" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="order-2 space-y-5 lg:order-none">
          <div
            className="rise rounded-card border hairline bg-white px-5 py-4 shadow-line"
            style={{ '--i': 1 } as React.CSSProperties}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </div>
          <div
            className="rise rounded-card border hairline bg-white px-5 py-4 shadow-line"
            style={{ '--i': 2 } as React.CSSProperties}
          >
            <Skeleton className="mb-3 h-5 w-20" />
            <Skeleton className="mb-3 h-2 w-full rounded-sm" />
            <SkeletonText lines={2} />
          </div>
        </div>

        <aside className="order-1 lg:order-none">
          <div
            className="rise rounded-card border hairline bg-white px-5 py-5 shadow-lift"
            style={{ '--i': 0 } as React.CSSProperties}
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-8 w-28" />
            <Skeleton className="mt-1.5 h-3 w-40" />
            <Skeleton className="mt-5 h-12 w-full rounded-xl" />
          </div>
        </aside>
      </div>
    </SkeletonShell>
  );
}
