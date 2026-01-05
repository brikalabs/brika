import React, { useEffect, useRef } from "react";
import { ScrollArea, Skeleton } from "@/components/ui";
import { useLocale } from "@/lib/use-locale";
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
  const { t, formatTime } = useLocale();
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
    return <div className="p-8 text-center text-muted-foreground">{t("logs:empty")}</div>;
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
              <Skeleton className="mx-auto h-8 w-32" />
            ) : (
              <span className="text-muted-foreground">{t("common:loading")}</span>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function LogRow({ log }: { log: StoredLogEvent }) {
  const timestamp = new Date(log.ts).toISOString().slice(11, 23);
  const source = log.pluginName ? `${log.source}:${log.pluginName}` : log.source;
  const isNew = log.id < 0; // Negative IDs are live logs

  return (
    <div
      className={`flex items-start gap-3 border-border/30 border-b px-4 py-1.5 hover:bg-muted/30 ${isNew ? "bg-primary/5" : ""}`}
    >
      <span className="shrink-0 text-muted-foreground tabular-nums">{timestamp}</span>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 font-semibold text-[10px] uppercase ${LEVEL_COLORS[log.level] || ""}`}
      >
        {log.level}
      </span>
      <span className="w-32 shrink-0 truncate text-muted-foreground" title={source}>
        {source}
      </span>
      <span className="flex-1 text-foreground">{log.message}</span>
      {log.meta && (
        <span className="max-w-xs truncate text-muted-foreground/70" title={JSON.stringify(log.meta)}>
          {JSON.stringify(log.meta)}
        </span>
      )}
    </div>
  );
}
