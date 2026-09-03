import {
  Skeleton,
  SkeletonPageHeader,
  SkeletonSessionCard,
  SkeletonShell,
} from '@/components/ui/skeleton';

export default function DiscoverLoading() {
  return (
    <SkeletonShell>
      <SkeletonPageHeader />
      <div className="mb-5 flex gap-2" aria-hidden>
        {[16, 24, 20, 24, 24, 20].map((w, i) => (
          <Skeleton key={i} className={`h-8 rounded-full w-${w}`} />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SkeletonSessionCard key={i} index={i} />
        ))}
      </div>
    </SkeletonShell>
  );
}
