import React, { useRef, useEffect } from "react";
import { ScrollArea, Skeleton } from "@/components/ui";
import type { StoredLogEvent } from "../api";

const LEVEL_COLORS: Record<string, string> = {
  error: "text-red-400 bg-red-500/10",
  warn: "text-yellow-400 bg-yellow-500/10",
  info: "text-emerald-400 bg-emerald-500/10",
  debug: "text-zinc-400 bg-zinc-500/10",
};

interface LogListProps {
  logs: StoredLogEvent[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function LogList({ logs, isLoading, isFetchingMore, hasMore, onLoadMore }: LogListProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

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

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return <div className="p-8 text-muted-foreground text-center">No logs found matching your filters</div>;
  }

  return (
    <ScrollArea className="h-[600px]">
      <div className="font-mono text-xs">
        {logs.map((log) => (
          <LogRow key={log.id} log={log} />
        ))}

        {/* Load more trigger */}
        {hasMore && (
          <div ref={loadMoreRef} className="p-4 text-center">
            {isFetchingMore ? (
              <Skeleton className="h-8 w-32 mx-auto" />
            ) : (
              <span className="text-muted-foreground">Scroll for more...</span>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function LogRow({ log }: { log: StoredLogEvent }) {
  const timestamp = new Date(log.ts).toISOString().slice(11, 23);
  const source = log.pluginRef ? `${log.source}:${log.pluginRef}` : log.source;
  const isNew = log.id < 0; // Negative IDs are live logs

  return (
    <div
      className={`flex gap-3 px-4 py-1.5 border-b border-border/30 hover:bg-muted/30 items-start ${isNew ? "bg-primary/5" : ""}`}
    >
      <span className="text-muted-foreground shrink-0 tabular-nums">{timestamp}</span>
      <span
        className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${LEVEL_COLORS[log.level] || ""}`}
      >
        {log.level}
      </span>
      <span className="text-muted-foreground shrink-0 w-32 truncate" title={source}>
        {source}
      </span>
      <span className="text-foreground flex-1">{log.message}</span>
      {log.meta && (
        <span className="text-muted-foreground/70 truncate max-w-xs" title={JSON.stringify(log.meta)}>
          {JSON.stringify(log.meta)}
        </span>
      )}
    </div>
  );
}
