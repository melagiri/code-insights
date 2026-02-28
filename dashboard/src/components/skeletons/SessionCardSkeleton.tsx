import { Skeleton } from '@/components/ui/skeleton';

export function SessionCardSkeleton() {
  return (
    <div className="rounded-lg border px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20 rounded-full" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
        <Skeleton className="h-4 w-20 shrink-0" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3.5 w-14" />
      </div>
    </div>
  );
}
