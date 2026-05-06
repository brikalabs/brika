import { Skeleton } from "@brika/clay";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/use-locale";
import type { StoredLogEvent } from "../api";
import { LogRow } from "./LogRow";

interface LogListProps {
  logs: StoredLogEvent[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  pendingCount?: number;
  onRevealPending?: () => void;
}

const AT_TOP_THRESHOLD = 40;

export function LogList({
  logs,
  isLoading,
  isFetchingMore,
  hasMore,
  onLoadMore,
  pendingCount = 0,
  onRevealPending,
}: Readonly<LogListProps>) {
  const { t } = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const firstLogIdRef = useRef<number | undefined>(undefined);
  const isAtTopRef = useRef(true);

  // Lifted out of LogRow so virtualization doesn't destroy it when rows leave the viewport.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(new Set());

  const toggleExpanded = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 10,
    // measureElement lets the virtualizer track actual row heights (important
    // for expanded rows that are taller than the estimate).
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Preserve scroll position when logs are prepended at the top (live stream).
  // Without this, scrollTop stays the same while content height grows, making
  // the viewport jump to show different content than what the user was reading.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !logs.length) { return; }

    const currentFirstId = logs[0].id;
    if (firstLogIdRef.current !== undefined && currentFirstId !== firstLogIdRef.current) {
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      // Only compensate when meaningfully scrolled — avoids fighting with scroll-to-top
      if (diff > 0 && el.scrollTop > AT_TOP_THRESHOLD) {
        el.scrollTop += diff;
      }
    }
    firstLogIdRef.current = currentFirstId;
    prevScrollHeightRef.current = el.scrollHeight;
  }, [logs]);

  // Auto-reveal pending logs when at top (live-follow mode).
  useEffect(() => {
    if (isAtTopRef.current && pendingCount > 0) {
      onRevealPending?.();
    }
  }, [pendingCount, onRevealPending]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) { return; }

    const atTop = el.scrollTop <= AT_TOP_THRESHOLD;
    if (atTop && !isAtTopRef.current) {
      onRevealPending?.();
    }
    isAtTopRef.current = atTop;
  }, [onRevealPending]);

  // Trigger infinite scroll when the last visible row reaches the end of the list.
  const lastVirtualIndex = virtualizer.getVirtualItems().at(-1)?.index ?? -1;
  useEffect(() => {
    if (lastVirtualIndex >= logs.length - 1 && hasMore && !isFetchingMore) {
      onLoadMore?.();
    }
  }, [lastVirtualIndex, logs.length, hasMore, isFetchingMore, onLoadMore]);

  const scrollToTopAndReveal = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      // Set directly (not smooth) so scrollTop is already 0 when useLayoutEffect
      // fires after the reveal — avoids the compensation kicking in and undoing the scroll.
      el.scrollTop = 0;
    }
    onRevealPending?.();
  }, [onRevealPending]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={`log-skeleton-${i}`} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (logs.length === 0 && pendingCount === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">{t("logs:empty")}</div>
    );
  }

  return (
    <div className="relative">
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={scrollToTopAndReveal}
          className="absolute top-2 left-1/2 z-10 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-primary/30 bg-primary px-3 py-1 font-medium text-primary-foreground text-xs shadow-lg transition-all hover:bg-primary/90"
        >
          <ArrowUp className="size-3" />
          {t("logs:newMessages", { count: pendingCount })}
        </button>
      )}

      {/* overflow-anchor:none disables browser scroll anchoring so our manual
          useLayoutEffect adjustment above is the single source of truth. */}
      <div
        ref={scrollRef}
        className="h-150 overflow-y-auto"
        style={{ overflowAnchor: "none" }}
        onScroll={handleScroll}
      >
        {/* Total size drives the scrollbar height; rows are absolutely positioned. */}
        <div className="relative font-mono text-xs" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const log = logs[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <LogRow
                  log={log}
                  isExpanded={expandedIds.has(log.id)}
                  onToggle={toggleExpanded}
                />
              </div>
            );
          })}
        </div>

        {hasMore && isFetchingMore && (
          <div className="p-4 text-center">
            <Skeleton className="mx-auto h-8 w-32" />
          </div>
        )}
      </div>
    </div>
  );
}
