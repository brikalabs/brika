import { Card, Skeleton } from '@brika/clay';

export function WorkflowCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-14" />
          </div>
          <Skeleton className="h-3.5 w-48" />
        </div>
        <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
        <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
      </div>

      <div className="mt-2.5 flex items-center justify-between pl-13">
        <div className="flex items-center gap-1">
          <Skeleton className="size-6 rounded-md" />
          <Skeleton className="size-6 rounded-md" />
          <Skeleton className="size-6 rounded-md" />
        </div>
        <Skeleton className="h-3.5 w-20" />
      </div>
    </Card>
  );
}
