import { Skeleton } from '@/components/ui/skeleton';

export function InsightCardSkeleton() {
  return (
    <div className="rounded-lg border px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-4/5" />
      <Skeleton className="h-3 w-24 mt-1" />
    </div>
  );
}
