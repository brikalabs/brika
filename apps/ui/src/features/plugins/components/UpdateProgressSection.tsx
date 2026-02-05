import { CheckCircle2, XCircle } from 'lucide-react';
import React from 'react';
import { Progress, ScrollArea } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { OperationProgress } from '../registry-api';

interface UpdateProgressSectionProps {
  progress: OperationProgress | null;
  logs: string[];
  error: string | null;
  success: boolean;
}

function getProgressValue(progress: OperationProgress | null) {
  if (!progress) return 0;
  switch (progress.phase) {
    case 'resolving':
      return 20;
    case 'downloading':
      return 50;
    case 'linking':
      return 80;
    case 'complete':
      return 100;
    default:
      return 0;
  }
}

function getPhaseLabel(progress: OperationProgress | null) {
  if (!progress) return '';
  switch (progress.phase) {
    case 'resolving':
      return 'Resolving dependencies...';
    case 'downloading':
      return 'Downloading updates...';
    case 'linking':
      return 'Linking packages...';
    case 'complete':
      return 'Update complete!';
    case 'error':
      return 'Update failed';
    default:
      return '';
  }
}

export function UpdateProgressSection({
  progress,
  logs,
  error,
  success,
}: UpdateProgressSectionProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{getPhaseLabel(progress)}</span>
          {success && <CheckCircle2 className="size-4 text-emerald-500" />}
          {error && <XCircle className="size-4 text-destructive" />}
        </div>
        <Progress
          value={getProgressValue(progress)}
          className={cn(
            'h-2',
            error && '[&>div]:bg-destructive',
            success && '[&>div]:bg-emerald-500'
          )}
        />
      </div>

      <ScrollArea className="h-40 rounded-md border bg-muted/30 p-3">
        <div ref={scrollRef} className="space-y-1 font-mono text-xs">
          {logs.map((log, i) => (
            <div key={i} className="text-muted-foreground">
              {log}
            </div>
          ))}
        </div>
      </ScrollArea>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
