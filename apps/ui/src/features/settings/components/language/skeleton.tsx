import { Skeleton } from '@/components/ui';

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
