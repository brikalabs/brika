import type { StoredLogEvent } from "../api";

interface LogRowExpandedSectionProps {
  log: StoredLogEvent;
  sourceFile: string | null;
  sourceLine: number | null;
  generalMeta: Record<string, unknown> | null;
}

export function LogRowExpandedSection({
  log,
  sourceFile,
  sourceLine,
  generalMeta,
}: Readonly<LogRowExpandedSectionProps>) {
  const hasGeneralMeta = generalMeta && Object.keys(generalMeta).length > 0;

  return (
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
      {log.error && (
        <div className="space-y-2">
          {/* Error name and message */}
          <div className="rounded border border-red-500/20 bg-red-500/10 p-3">
            <div className="font-semibold text-red-400 text-xs">
              {log.error.name}: {log.error.message}
            </div>
            {log.error.cause && (
              <div className="mt-2 text-[10px] text-red-300/70">
                <span className="font-semibold">Caused by:</span> {log.error.cause}
              </div>
            )}
          </div>

          {/* Error stack trace */}
          {log.error.stack && (
            <div className="rounded bg-black/40 p-3">
              <div className="mb-1 font-semibold text-muted-foreground text-xs">Stack Trace:</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] text-red-300/90 leading-relaxed">
                {log.error.stack}
              </pre>
            </div>
          )}
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
  );
}
