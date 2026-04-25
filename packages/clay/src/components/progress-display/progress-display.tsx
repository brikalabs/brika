import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { RefObject } from 'react';
import { cn } from '../../primitives/cn';
import { Progress } from '../progress';
import { ScrollArea } from '../scroll-area';

interface ProgressDisplayProps {
  progressValue: number;
  phaseLabel: string;
  logs: string[];
  scrollRef: RefObject<HTMLDivElement | null>;
  error: string | null;
  success: boolean;
  isProcessing: boolean;
  emptyLogsMessage?: string;
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
      <ScrollArea className="h-40 rounded-md border bg-muted/30 p-3">
        <div ref={scrollRef} className="space-y-1 font-mono text-xs">
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
