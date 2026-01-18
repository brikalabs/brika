import { AlertCircle, AlertTriangle, Bug, ChevronDown, ChevronRight, Info } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { ScrollArea, Skeleton } from "@/components/ui";
import { useLocale } from "@/lib/use-locale";
import type { StoredLogEvent } from "../api";

const LEVEL_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  error: {
    color: "text-red-400 bg-red-500/10 border-red-500/20",
    icon: AlertCircle,
    label: "ERROR",
  },
  warn: {
    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    icon: AlertTriangle,
    label: "WARN",
  },
  info: {
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    icon: Info,
    label: "INFO",
  },
  debug: {
    color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
    icon: Bug,
    label: "DEBUG",
  },
};

interface LogListProps {
  logs: StoredLogEvent[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function LogList({ logs, isLoading, isFetchingMore, hasMore, onLoadMore }: LogListProps) {
  const { t } = useLocale();
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
  const [isExpanded, setIsExpanded] = useState(false);
  const timestamp = new Date(log.ts).toISOString().slice(11, 23);
  const source = log.pluginName ? `${log.source}:${log.pluginName}` : log.source;
  const isNew = log.id < 0; // Negative IDs are live logs
  const config = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
  const Icon = config.icon;

  // Check if this log has error details or any metadata
  const hasErrorStack = log.meta?.errorStack;
  const hasMetadata = log.meta && Object.keys(log.meta).length > 0;
  const isExpandable = hasMetadata; // All logs with metadata are expandable

  // Extract source location if available
  const sourceFile = log.meta?.sourceFile ? String(log.meta.sourceFile) : null;
  const sourceLine = log.meta?.sourceLine ? Number(log.meta.sourceLine) : null;

  // Filter out error-specific and source location fields from general metadata
  const generalMeta = log.meta
    ? Object.fromEntries(
        Object.entries(log.meta).filter(
          ([key]) => !["errorStack", "errorName", "errorMessage", "error", "sourceFile", "sourceLine"].includes(key),
        ),
      )
    : null;

  const hasGeneralMeta = generalMeta && Object.keys(generalMeta).length > 0;

  return (
    <div
      className={`border-border/30 border-b px-4 py-2 transition-colors ${isNew ? "bg-primary/5" : ""} ${isExpanded ? "bg-muted/50" : "hover:bg-muted/30"}`}
    >
      {/* Main log row */}
      <div
        className={`flex items-start gap-3 ${isExpandable ? "cursor-pointer" : ""}`}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        {/* Expand indicator */}
        <div className="flex w-4 shrink-0 items-center justify-center">
          {isExpandable ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )
          ) : null}
        </div>

        {/* Timestamp */}
        <span className="shrink-0 text-muted-foreground tabular-nums">{timestamp}</span>

        {/* Level badge with icon */}
        <span
          className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-semibold text-[10px] ${config.color}`}
        >
          <Icon className="h-3 w-3" />
          {config.label}
        </span>

        {/* Source */}
        <span className="w-32 shrink-0 truncate text-muted-foreground" title={source}>
          {source}
        </span>

        {/* Message */}
        <span className={`flex-1 ${log.level === "error" ? "font-medium text-red-400" : "text-foreground"}`}>
          {log.message}
        </span>

        {/* Metadata indicator */}
        {hasGeneralMeta && !isExpanded && (
          <span className="shrink-0 text-[10px] text-muted-foreground/50">
            {Object.keys(generalMeta).length} field{Object.keys(generalMeta).length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Expanded section */}
      {isExpanded && (
        <div className="mt-2 ml-8 space-y-2 border-border/20 border-l-2 pl-4">
          {/* Source location */}
          {sourceFile && (
            <div className="rounded border border-blue-500/20 bg-blue-500/10 p-2">
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <span className="font-semibold text-blue-400">Source:</span>
                <span className="text-blue-300/90">
                  {sourceFile}
                  {sourceLine && <span className="text-blue-400">:{sourceLine}</span>}
                </span>
              </div>
            </div>
          )}

          {/* Error details */}
          {log.meta?.errorName && (
            <div className="space-y-1">
              <div className="font-semibold text-red-400 text-xs">
                {String(log.meta.errorName)}: {log.meta.errorMessage ? String(log.meta.errorMessage) : "Unknown error"}
              </div>
            </div>
          )}

          {/* Error stack trace */}
          {hasErrorStack && log.meta?.errorStack && (
            <div className="rounded bg-black/40 p-3">
              <div className="mb-1 font-semibold text-muted-foreground text-xs">Stack Trace:</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] text-red-300/90 leading-relaxed">
                {String(log.meta.errorStack)}
              </pre>
            </div>
          )}

          {/* General metadata */}
          {hasGeneralMeta && (
            <div className="rounded bg-muted/50 p-3">
              <div className="mb-1 font-semibold text-muted-foreground text-xs">Metadata:</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] text-foreground/80 leading-relaxed">
                {JSON.stringify(generalMeta, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
