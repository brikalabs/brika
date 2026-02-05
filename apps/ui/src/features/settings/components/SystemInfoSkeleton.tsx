import { Skeleton } from '@/components/ui';

function InfoItemSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Skeleton className="size-4" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="ml-auto h-4 w-32" />
    </div>
  );
}

export function SystemInfoSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-1 h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <InfoItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function LanguageSelectorSkeleton() {
  return (
    <div className="space-y-3">
      <div>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-1 h-4 w-56" />
      </div>
      <Skeleton className="h-10 w-64 rounded-md" />
    </div>
  );
}
