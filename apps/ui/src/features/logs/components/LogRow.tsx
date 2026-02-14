import { ChevronDown, ChevronRight } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { StoredLogEvent } from "../api";
import { LogRowExpandedSection } from "./LogRowExpandedSection";
import { LEVEL_CONFIG } from "./log-level-config";

interface LogRowProps {
  log: StoredLogEvent;
}

const SOURCE_LOCATION_KEYS = new Set(["sourceFile", "sourceLine"]);

function extractGeneralMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  return Object.fromEntries(
    Object.entries(meta).filter(([key]) => !SOURCE_LOCATION_KEYS.has(key)),
  );
}

interface LogRowColumnsProps {
  timestamp: string;
  source: string;
  config: { color: string; icon: React.ElementType; label: string };
  level: string;
  message: string;
}

function LogRowColumns({ timestamp, source, config, level, message }: Readonly<LogRowColumnsProps>) {
  const Icon = config.icon;
  const messageClass = level === "error" ? "font-medium text-red-400" : "text-foreground";

  return (
    <>
      <span className="shrink-0 text-muted-foreground tabular-nums">{timestamp}</span>
      <span className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-semibold text-[10px] ${config.color}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
      <span className="w-32 shrink-0 truncate text-muted-foreground" title={source}>{source}</span>
      <span className={`flex-1 ${messageClass}`}>{message}</span>
    </>
  );
}

function MetadataFieldCount({ generalMeta }: Readonly<{ generalMeta: Record<string, unknown> }>) {
  const count = Object.keys(generalMeta).length;
  if (count === 0) return null;
  return (
    <span className="shrink-0 text-[10px] text-muted-foreground/50">
      {count} field{count === 1 ? "" : "s"}
    </span>
  );
}

export function LogRow({ log }: Readonly<LogRowProps>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const timestamp = new Date(log.ts).toISOString().slice(11, 23);
  const source = log.pluginName ? `${log.source}:${log.pluginName}` : log.source;
  const isNew = log.id < 0;
  const config = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;

  const hasError = !!log.error;
  const hasMetadata = log.meta && Object.keys(log.meta).length > 0;
  const isExpandable = hasError || hasMetadata;

  const sourceFile = log.meta?.sourceFile != null ? String(log.meta.sourceFile) : null;
  const sourceLine = log.meta?.sourceLine != null ? Number(log.meta.sourceLine) : null;
  const generalMeta = extractGeneralMeta(log.meta);
  const hasGeneralMeta = generalMeta && Object.keys(generalMeta).length > 0;

  const columnProps: LogRowColumnsProps = { timestamp, source, config, level: log.level, message: log.message };
  const bgNew = isNew ? "bg-primary/5" : "";
  const bgExpanded = isExpanded ? "bg-muted/50" : "hover:bg-muted/30";
  const ExpandIcon = isExpanded ? ChevronDown : ChevronRight;

  return (
    <div className={`border-border/30 border-b px-4 py-2 transition-colors ${bgNew} ${bgExpanded}`}>
      {isExpandable ? (
        <button
          type="button"
          className="flex w-full cursor-pointer items-start gap-3 border-none bg-transparent p-0 text-left font-inherit text-inherit"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex w-4 shrink-0 items-center justify-center">
            <ExpandIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <LogRowColumns {...columnProps} />
          {hasGeneralMeta && !isExpanded && <MetadataFieldCount generalMeta={generalMeta} />}
        </button>
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex w-4 shrink-0 items-center justify-center" />
          <LogRowColumns {...columnProps} />
        </div>
      )}

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
