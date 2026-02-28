import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function StatsHeroSkeleton() {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex-1 min-w-[100px] px-4 py-3 border-r border-border last:border-r-0"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Skeleton className="h-3 w-3 rounded" />
                <Skeleton className="h-2.5 w-14" />
              </div>
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
