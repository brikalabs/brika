import { Card, Skeleton } from '@brika/clay';

export function SparkCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-1 h-3 w-24" />
          <Skeleton className="mt-2 h-4 w-full" />
        </div>
      </div>
      <div className="mt-3">
        <Skeleton className="h-4 w-16" />
      </div>
    </Card>
  );
}

export function SparkGroupSkeleton() {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="size-4" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-6 rounded-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({
          length: 3,
        }).map((_, i) => (
          <SparkCardSkeleton key={`spark-skeleton-${i}`} />
        ))}
      </div>
    </div>
  );
}
