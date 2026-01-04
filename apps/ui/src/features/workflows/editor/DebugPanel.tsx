import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Play,
  Square,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Workflow } from '../api';
import type { BlockStatus, ExecutionLog } from './useWorkflowEditor';

interface BlockEvent {
  type: 'block.start' | 'block.complete' | 'block.error';
  blockId: string;
  output?: unknown;
  error?: string;
}

interface DebugPanelProps {
  workflow: Workflow;
  onTest: (payload: Record<string, unknown>) => void;
  executionLogs: ExecutionLog[];
  blockStatuses: Record<string, BlockStatus>;
  onBlockEvent: (event: BlockEvent) => void;
  className?: string;
}

function LogEntry({ log }: Readonly<{ log: ExecutionLog }>) {
  const [expanded, setExpanded] = useState(false);

  const getIcon = () => {
    switch (log.type) {
      case 'start':
        return <Loader2 className="size-3 animate-spin text-blue-500" />;
      case 'complete':
        return <CheckCircle className="size-3 text-green-500" />;
      case 'error':
        return <XCircle className="size-3 text-red-500" />;
      default:
        return <AlertCircle className="size-3 text-muted-foreground" />;
    }
  };

  const getBgColor = () => {
    switch (log.type) {
      case 'error':
        return 'bg-red-500/10';
      case 'complete':
        return 'bg-green-500/5';
      default:
        return '';
    }
  };

  return (
    <div className={cn('border-b last:border-b-0', getBgColor())}>
      <button
        onClick={() => log.data && setExpanded(!expanded)}
        className="flex w-full items-start gap-2 p-2 text-left transition-colors hover:bg-accent/50"
      >
        {log.data ? (
          expanded ? (
            <ChevronDown className="mt-0.5 size-3" />
          ) : (
            <ChevronRight className="mt-0.5 size-3" />
          )
        ) : (
          <span className="w-3" />
        )}
        {getIcon()}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs">{log.message}</div>
          <div className="text-[10px] text-muted-foreground">
            {new Date(log.timestamp).toLocaleTimeString()}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {log.blockId}
        </Badge>
      </button>

      {expanded && log.data && (
        <div className="px-8 pb-2">
          <pre className="max-h-24 overflow-auto rounded bg-muted p-2 text-[10px]">
            {JSON.stringify(log.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function DebugPanel({
  workflow,
  onTest,
  executionLogs,
  blockStatuses,
  onBlockEvent,
  className,
}: Readonly<DebugPanelProps>) {
  const [payload, setPayload] = useState('{}');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [executionLogs]);

  // Start test execution
  const handleTest = () => {
    setError(null);
    setIsRunning(true);

    let payloadObj: Record<string, unknown> = {};
    try {
      payloadObj = JSON.parse(payload);
    } catch {
      setError('Invalid JSON payload');
      setIsRunning(false);
      return;
    }

    // Close existing connection
    eventSourceRef.current?.close();

    // Open SSE connection for test execution
    const params = new URLSearchParams({
      id: workflow.id,
      payload: JSON.stringify(payloadObj),
    });

    const eventSource = new EventSource(`/api/workflows/test?${params}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === 'block.start' ||
          data.type === 'block.complete' ||
          data.type === 'block.error'
        ) {
          onBlockEvent(data as BlockEvent);
        }
        if (data.type === 'workflow.complete' || data.type === 'workflow.error') {
          setIsRunning(false);
          eventSource.close();
        }
      } catch {
        console.error('Failed to parse SSE event:', event.data);
      }
    };

    eventSource.onerror = () => {
      setError('Connection lost');
      setIsRunning(false);
      eventSource.close();
    };

    // Start the test
    onTest(payloadObj);
  };

  // Stop execution
  const handleStop = () => {
    eventSourceRef.current?.close();
    setIsRunning(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const completedCount = Object.values(blockStatuses).filter((s) => s === 'completed').length;
  const errorCount = Object.values(blockStatuses).filter((s) => s === 'error').length;
  const totalBlocks = workflow.blocks?.length || 0;

  return (
    <div className={cn('flex h-full flex-col border-l bg-card', className)}>
      <div className="border-b p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-medium text-sm">
            <Zap className="size-4" />
            Test Workflow
          </h3>
          {isRunning && (
            <Badge variant="secondary" className="animate-pulse">
              <Loader2 className="mr-1 size-3 animate-spin" />
              Running
            </Badge>
          )}
        </div>

        {/* Progress indicator */}
        {(completedCount > 0 || errorCount > 0) && (
          <div className="mb-2 flex items-center gap-2 text-xs">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${(completedCount / totalBlocks) * 100}%` }}
              />
            </div>
            <span className="text-muted-foreground">
              {completedCount}/{totalBlocks}
            </span>
            {errorCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {errorCount} errors
              </Badge>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="payload" className="flex flex-1 flex-col">
        <TabsList className="mx-3 mt-2">
          <TabsTrigger value="payload" className="text-xs">
            Payload
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">
            Logs
            {executionLogs.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1 text-[10px]">
                {executionLogs.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payload" className="flex-1 p-3 pt-2">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-muted-foreground text-xs">
                Test Payload (JSON)
              </label>
              <Textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                placeholder='{"key": "value"}'
                className="font-mono text-xs"
                rows={6}
              />
            </div>

            {error && <div className="rounded bg-red-500/10 p-2 text-red-500 text-xs">{error}</div>}

            <div className="flex gap-2">
              {isRunning ? (
                <Button size="sm" variant="destructive" onClick={handleStop} className="flex-1">
                  <Square className="mr-1 size-4" />
                  Stop
                </Button>
              ) : (
                <Button size="sm" onClick={handleTest} className="flex-1">
                  <Play className="mr-1 size-4" />
                  Run Test
                </Button>
              )}
            </div>

            <div className="text-muted-foreground text-xs">
              <p>The workflow will be executed with this payload as the trigger data.</p>
              <p className="mt-1">
                Access via: <code className="rounded bg-muted px-1">trigger.payload</code>
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              {executionLogs.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  <Clock className="mx-auto mb-2 size-8 opacity-50" />
                  Run a test to see logs
                </div>
              ) : (
                <div>
                  {executionLogs.map((log) => (
                    <LogEntry key={log.id} log={log} />
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </ScrollArea>
          </div>

          {executionLogs.length > 0 && (
            <div className="border-t p-2">
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs"
                onClick={() => {
                  // This should call clearExecutionState from parent
                  // For now, just a placeholder
                }}
              >
                <Trash2 className="mr-1 size-3" />
                Clear Logs
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
