import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { RefObject } from 'react';
import { cn } from '../../primitives/cn';
import { Progress } from '../progress';
import { ScrollArea } from '../scroll-area';

interface ProgressDisplayProps {
  /** Progress percentage from 0 to 100. Drives the bar fill width. */
  progressValue: number;
  /** Short label rendered above the bar (e.g. "Uploading…"). */
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

export function ProgressDisplay({
  progressValue,
  phaseLabel,
  logs,
  scrollRef,
  error,
  success,
  isProcessing,
  emptyLogsMessage,
  successMessage,
}: Readonly<ProgressDisplayProps>) {
  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{phaseLabel}</span>
          {success && <CheckCircle2 className="size-4 text-emerald-500" />}
          {error && <XCircle className="size-4 text-destructive" />}
          {isProcessing && !success && !error && (
            <Loader2 className="size-4 animate-spin text-primary" />
          )}
        </div>
        <Progress
          value={progressValue}
          className={cn(
            'h-2',
            error && '[&>div]:bg-destructive',
            success && '[&>div]:bg-emerald-500'
          )}
        />
      </div>

      {/* Log output */}
      <ScrollArea className="h-40 rounded-md border bg-muted/30">
        <div ref={scrollRef} className="space-y-1 break-words p-3 font-mono text-xs">
          {logs.length === 0 && isProcessing && emptyLogsMessage && (
            <div className="text-muted-foreground">{emptyLogsMessage}</div>
          )}
          {logs.map((log, i) => (
            <div key={`log-${i}-${log.slice(0, 24)}`} className="text-muted-foreground">
              {log}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Success message */}
      {success && successMessage && (
        <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-emerald-600 text-sm">
          {successMessage}
        </div>
      )}
    </div>
  );
}
