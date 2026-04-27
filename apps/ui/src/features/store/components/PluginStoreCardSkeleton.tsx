import { Card, Skeleton } from '@brika/clay';

export function PluginStoreCardSkeleton() {
  return (
    <Card className="h-full p-5">
      <div className="space-y-3">
        {/* Header: Icon + Title/Badges + Install Button */}
        <div className="flex items-start gap-4">
          {/* Plugin Icon Skeleton */}
          <Skeleton className="size-14 shrink-0 rounded-2xl" />

          {/* Title + Badges Skeleton */}
          <div className="min-w-0 flex-1 space-y-2">
            {/* Title */}
            <Skeleton className="h-5 w-3/4" />

            {/* Status Badges */}
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>

          {/* Install Button Skeleton */}
          <Skeleton className="size-8 shrink-0 rounded-md" />
        </div>

        {/* Description Skeleton */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>

        {/* Metadata Row Skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-3.5 w-12" />
        </div>
      </div>
    </Card>
  );
}
