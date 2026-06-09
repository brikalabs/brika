import { Button, ScrollArea } from '@brika/clay';
import { CheckCircle, ChevronLeft, Loader2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import type { RunEvent, WorkflowRun } from '../api';
import { type DebugEvent, DebugEventEntry } from '../debug';
import { useWorkflowRun, useWorkflowRuns } from '../hooks';
import { AgentRunInspector, isAgentRun } from './AgentRunInspector';

function RunStatusIcon({ status }: Readonly<{ status: WorkflowRun['status'] }>) {
  if (status === 'running') {
    return <Loader2 className="size-4 shrink-0 animate-spin text-status-running" />;
  }
  if (status === 'error') {
    return <XCircle className="size-4 shrink-0 text-status-error" />;
  }
  return <CheckCircle className="size-4 shrink-0 text-status-completed" />;
}

function runEventToDebug(workflowId: string, event: RunEvent): DebugEvent {
  return {
    type: event.kind,
    workflowId,
    blockId: event.blockId,
    port: event.port,
    data: event.data,
    level: event.level,
    message: event.message,
    timestamp: event.ts,
  };
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

function formatDuration(run: WorkflowRun): string {
  if (run.finishedAt === undefined) {
    return '...';
  }
  const ms = run.finishedAt - run.startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Recorded run history for a workflow: a list of runs and, on selection, the
 * event timeline of one run. Reuses the live-debug row renderer so a recorded
 * trace reads identically to the live stream.
 */
export function RunsView({ workflowId }: Readonly<{ workflowId: string | null }>) {
  const { t } = useLocale();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { data: runs = [] } = useWorkflowRuns(workflowId ?? undefined);
  const { data: detail } = useWorkflowRun(selectedRunId);

  if (selectedRunId) {
    return (
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={() => setSelectedRunId(null)}>
          <ChevronLeft className="size-4" />
          {t('common:actions.back')}
        </Button>
        <div className="rounded-lg border bg-muted/50 p-2">
          {detail && isAgentRun(detail.events) ? (
            <AgentRunInspector run={detail.run} events={detail.events} />
          ) : (
            <ScrollArea className="[&_[data-radix-scroll-area-viewport]>div]:block! h-90 [&_[data-radix-scroll-area-viewport]>div]:w-full [&_[data-radix-scroll-area-viewport]>div]:max-w-full">
              {detail && detail.events.length > 0 ? (
                <div className="space-y-0">
                  {detail.events.map((event) => (
                    <DebugEventEntry
                      key={event.id}
                      event={runEventToDebug(detail.run.workflowId, event)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  {t('workflows:runs.empty')}
                </div>
              )}
            </ScrollArea>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/50 p-2">
      <ScrollArea className="[&_[data-radix-scroll-area-viewport]>div]:block! h-100 [&_[data-radix-scroll-area-viewport]>div]:w-full [&_[data-radix-scroll-area-viewport]>div]:max-w-full">
        {runs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            {t('workflows:runs.empty')}
          </div>
        ) : (
          <div className="space-y-1">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedRunId(run.id)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors hover:bg-muted"
              >
                <RunStatusIcon status={run.status} />
                <span className="text-muted-foreground">{formatTime(run.startedAt)}</span>
                <span className="truncate text-data-7">{run.triggerBlockId ?? '-'}</span>
                {run.error ? <span className="truncate text-destructive">{run.error}</span> : null}
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {formatDuration(run)}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {run.eventCount ?? 0} {t('workflows:debug.events')}
                </span>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
