import { cn } from '@brika/clay';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { type RefObject, useEffect } from 'react';

interface PluginProgressProps {
  /** Progress percentage from 0 to 100. Drives the bar fill width. */
  progressValue: number;
  /** Short label rendered above the bar (e.g. "Downloading…"). */
  phaseLabel: string;
  /** Lines rendered in the log scroll area, oldest first. */
  logs: string[];
  /** Ref attached to the inner log container so callers can auto-scroll. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Error message; when set, the bar turns destructive and an error block is shown. */
  error: string | null;
  /** Marks the run as finished successfully; turns the bar green and shows a check. */
  success: boolean;
  /** Whether work is in flight; controls the spinner and empty-state copy. */
  isProcessing: boolean;
  /** Copy shown when `logs` is empty and `isProcessing` is true. */
  emptyLogsMessage?: string;
  /** Copy shown in the success block when `success` is true. */
  successMessage?: string;
}

type LineKind = 'build' | 'success' | 'error' | 'info';

/** Classify a log line by its content (backend log lines are English). A bulk "Update all" log prefixes
 *  each build line with the plugin name (`@scope/pkg: Compiling…`); strip it before matching. */
function lineKind(line: string): LineKind {
  const l = line.replace(/^\S+:\s+/, '').toLowerCase();
  if (l.includes('failed') || l.includes('error')) {
    return 'error';
  }
  if (l.startsWith('compil')) {
    return 'build';
  }
  if (l.includes('successfully') || l.includes('(disabled)')) {
    return 'success';
  }
  return 'info';
}

const LINE_TEXT: Record<LineKind, string> = {
  build: 'text-sky-500 dark:text-sky-400',
  success: 'text-emerald-500',
  error: 'text-destructive/90',
  info: 'text-muted-foreground',
};

const LINE_DOT: Record<LineKind, string> = {
  build: 'bg-sky-400',
  success: 'bg-emerald-400',
  error: 'bg-destructive',
  info: 'bg-muted-foreground/25',
};

function StatusIcon({
  success,
  error,
  isProcessing,
}: Readonly<{ success: boolean; error: string | null; isProcessing: boolean }>) {
  if (success) {
    return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />;
  }
  if (error) {
    return <XCircle className="size-4 shrink-0 text-destructive" />;
  }
  if (isProcessing) {
    return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
  }
  return null;
}

/** Bar fill: a soft gradient, with a faint glow on the in-progress (primary) state. */
function barFill(error: string | null, success: boolean): string {
  if (error) {
    return 'bg-gradient-to-r from-destructive to-destructive/80';
  }
  if (success) {
    return 'bg-gradient-to-r from-emerald-500 to-emerald-400';
  }
  return 'bg-gradient-to-r from-primary to-primary/70 shadow-[0_0_10px_-2px] shadow-primary/50';
}

/**
 * Progress + color-coded build/install log for the plugin install/update dialogs. Clay's
 * `ProgressDisplay` renders every line the same gray, which is hard to scan once build steps are
 * interleaved; this gives a modern log view: a status dot per line, lines tinted by kind (build = sky,
 * success = emerald, error = destructive, the rest muted), a gradient bar, and icon-led status blocks.
 */
export function PluginProgress({
  progressValue,
  phaseLabel,
  logs,
  scrollRef,
  error,
  success,
  isProcessing,
  emptyLogsMessage,
  successMessage,
}: Readonly<PluginProgressProps>) {
  const pct = Math.max(0, Math.min(100, progressValue));

  // Keep the newest line in view as the log grows. Build lines arrive on a separate stream from the
  // install progress, so own the auto-scroll here rather than relying on the progress hook's (which
  // only reacts to its own logs, not the merged build lines).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length, scrollRef]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground text-sm">{phaseLabel}</span>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <span className="text-[11px] text-muted-foreground/70 tabular-nums">{pct}%</span>
          )}
          <StatusIcon success={success} error={error} isProcessing={isProcessing} />
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            barFill(error, success)
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div
        ref={scrollRef}
        className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border/40 bg-foreground/[0.015] p-3.5"
      >
        {logs.length === 0 ? (
          <span className="font-mono text-[12px] text-muted-foreground/40">
            {isProcessing ? emptyLogsMessage : ''}
          </span>
        ) : (
          logs.map((line, i) => {
            const kind = lineKind(line);
            return (
              // Logs are append-only and may repeat (e.g. two cached builds), so index is the key.
              <div key={`${i}-${line}`} className="flex items-start gap-2.5 font-mono text-[12px]">
                <span className={cn('mt-[7px] size-1 shrink-0 rounded-full', LINE_DOT[kind])} />
                <span
                  className={cn('whitespace-pre-wrap break-words leading-[1.55]', LINE_TEXT[kind])}
                >
                  {line}
                </span>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[12.5px] text-destructive">
          <XCircle className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && successMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-2.5 text-[12.5px] text-emerald-500">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
    </div>
  );
}
