import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { StoredLogEvent } from "../api";
import { LogRowExpandedSection } from "./LogRowExpandedSection";
import { LEVEL_CONFIG } from "./log-level-config";

interface LogRowProps {
  log: StoredLogEvent;
}

export function LogRow({ log }: Readonly<LogRowProps>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const timestamp = new Date(log.ts).toISOString().slice(11, 23);
  const source = log.pluginName ? `${log.source}:${log.pluginName}` : log.source;
  const isNew = log.id < 0; // Negative IDs are live logs
  const config = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
  const Icon = config.icon;

  // Check if this log has error details or any metadata
  const hasError = !!log.error;
  const hasMetadata = log.meta && Object.keys(log.meta).length > 0;
  const isExpandable = hasError || hasMetadata;

  // Extract source location if available
  const sourceFile = log.meta?.sourceFile ? String(log.meta.sourceFile) : null;
  const sourceLine = log.meta?.sourceLine ? Number(log.meta.sourceLine) : null;

  // Filter out source location fields from general metadata
  const generalMeta = log.meta
    ? Object.fromEntries(
        Object.entries(log.meta).filter(([key]) => !["sourceFile", "sourceLine"].includes(key)),
      )
    : null;

  const hasGeneralMeta = generalMeta && Object.keys(generalMeta).length > 0;

  return (
    <div
      className={`border-border/30 border-b px-4 py-2 transition-colors ${isNew ? "bg-primary/5" : ""} ${isExpanded ? "bg-muted/50" : "hover:bg-muted/30"}`}
    >
      {/* Main log row */}
      {isExpandable ? (
        <button
          type="button"
          className="flex w-full items-start gap-3 cursor-pointer bg-transparent border-none p-0 text-left font-inherit text-inherit"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Expand indicator */}
          <div className="flex w-4 shrink-0 items-center justify-center">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <span className="shrink-0 text-muted-foreground tabular-nums">{timestamp}</span>
          <span className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-semibold text-[10px] ${config.color}`}>
            <Icon className="h-3 w-3" />
            {config.label}
          </span>
          <span className="w-32 shrink-0 truncate text-muted-foreground" title={source}>{source}</span>
          <span className={`flex-1 ${log.level === "error" ? "font-medium text-red-400" : "text-foreground"}`}>{log.message}</span>
          {hasGeneralMeta && !isExpanded && (
            <span className="shrink-0 text-[10px] text-muted-foreground/50">
              {Object.keys(generalMeta).length} field{Object.keys(generalMeta).length !== 1 ? "s" : ""}
            </span>
          )}
        </button>
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex w-4 shrink-0 items-center justify-center" />
          <span className="shrink-0 text-muted-foreground tabular-nums">{timestamp}</span>
          <span className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-semibold text-[10px] ${config.color}`}>
            <Icon className="h-3 w-3" />
            {config.label}
          </span>
          <span className="w-32 shrink-0 truncate text-muted-foreground" title={source}>{source}</span>
          <span className={`flex-1 ${log.level === "error" ? "font-medium text-red-400" : "text-foreground"}`}>{log.message}</span>
        </div>
      )}

      {/* Expanded section */}
      {isExpanded && (
        <LogRowExpandedSection
          log={log}
          sourceFile={sourceFile}
          sourceLine={sourceLine}
          generalMeta={generalMeta}
        />
      )}
    </div>
  );
}
