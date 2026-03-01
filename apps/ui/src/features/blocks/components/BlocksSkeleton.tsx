import { BlockCardSkeleton } from './BlockCardSkeleton';

export function BlocksSkeleton() {
  return (
    <div className="space-y-10">
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="h-7 w-20 animate-pulse rounded-md bg-accent" />
          <div className="h-5 w-8 animate-pulse rounded-full bg-accent" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({
            length: 8,
          }).map((_, i) => (
            <BlockCardSkeleton key={`block-skeleton-${i}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
