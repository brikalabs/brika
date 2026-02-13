import { useEffect, useRef } from "react";
import { useDataView } from "@/components/DataView";
import { ScrollArea, Skeleton } from "@/components/ui";
import { useLocale } from "@/lib/use-locale";
import type { StoredLogEvent } from "../api";
import { LogRow } from "./LogRow";

interface LogListProps {
  logs: StoredLogEvent[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function LogList({ logs, isLoading, isFetchingMore, hasMore, onLoadMore }: Readonly<LogListProps>) {
  const { t } = useLocale();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const View = useDataView({ data: logs, isLoading: isLoading ?? false });

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !onLoadMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isFetchingMore]);

  return (
    <View.Root>
      <View.Skeleton>
        <div className="space-y-2 p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={`log-skeleton-${i}`} className="h-8 w-full" />
          ))}
        </div>
      </View.Skeleton>

      <View.Empty>
        <div className="p-8 text-center text-muted-foreground">{t("logs:empty")}</div>
      </View.Empty>

      <View.Content>
        {(logs) => (
          <ScrollArea className="h-[600px]">
            <div className="font-mono text-xs">
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}

              {/* Load more trigger */}
              {hasMore && (
                <div ref={loadMoreRef} className="p-4 text-center">
                  {isFetchingMore ? (
                    <Skeleton className="mx-auto h-8 w-32" />
                  ) : (
                    <span className="text-muted-foreground">{t("common:loading")}</span>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </View.Content>
    </View.Root>
  );
}
