import {
  Skeleton,
  SkeletonPageHeader,
  SkeletonShell,
  SkeletonText,
} from '@/components/ui/skeleton';

/** Generic fallback for every route that does not ship its own. */
export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonPageHeader />
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rise rounded-card border hairline bg-white px-5 py-4 shadow-line"
            style={{ '--i': i } as React.CSSProperties}
          >
            <Skeleton className="mb-3 h-5 w-40" />
            <SkeletonText lines={3} />
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}
