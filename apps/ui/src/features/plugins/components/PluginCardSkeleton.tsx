import { Card, Skeleton } from '@/components/ui';

export function PluginCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        {/* Plugin Icon */}
        <Skeleton className="size-12 shrink-0 rounded-xl" />

        {/* Plugin Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
          <Skeleton className="mt-2 h-4 w-full" />

          {/* Stats Row */}
          <div className="mt-2.5 flex items-center gap-3">
            <Skeleton className="h-6 w-20 rounded-md" />
            <Skeleton className="h-6 w-16 rounded-md" />
          </div>
        </div>

        {/* Right Side: Status + Actions */}
        <div className="flex shrink-0 flex-col items-end gap-3">
          <Skeleton className="h-5 w-16 rounded-full" />
          <div className="flex gap-1">
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        </div>
      </div>
    </Card>
  );
}
