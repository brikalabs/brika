import { Card, Skeleton } from '@brika/clay';

export function StatCardSkeleton() {
  return (
    <Card className="h-full p-5">
      <div className="relative flex h-full flex-col justify-center">
        <Skeleton className="absolute top-0 right-0 size-9 rounded-full" />
        <Skeleton className="h-9 w-16" />
        <Skeleton className="mt-2 h-4 w-24" />
      </div>
    </Card>
  );
}
