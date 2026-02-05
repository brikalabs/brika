import { Card, Skeleton } from '@/components/ui';

export function BlockCardSkeleton() {
  return (
    <Card className="h-full p-5">
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-3/4" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </Card>
  );
}
