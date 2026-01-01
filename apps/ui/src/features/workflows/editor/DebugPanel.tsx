import React, { useState, useEffect, useRef } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Textarea,
  Badge,
  ScrollArea,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { 
  Play, Square, ChevronDown, ChevronRight, 
  Loader2, CheckCircle, XCircle, AlertCircle,
  Trash2, Clock, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Workflow } from "../api";
import type { BlockStatus, ExecutionLog } from "./useWorkflowEditor";

interface BlockEvent {
  type: "block.start" | "block.complete" | "block.error";
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

function LogEntry({ log }: { log: ExecutionLog }) {
  const [expanded, setExpanded] = useState(false);
  
  const getIcon = () => {
    switch (log.type) {
      case "start":
        return <Loader2 className="size-3 text-blue-500 animate-spin" />;
      case "complete":
        return <CheckCircle className="size-3 text-green-500" />;
      case "error":
        return <XCircle className="size-3 text-red-500" />;
      default:
        return <AlertCircle className="size-3 text-muted-foreground" />;
    }
  };

  const getBgColor = () => {
    switch (log.type) {
      case "error":
        return "bg-red-500/10";
      case "complete":
        return "bg-green-500/5";
      default:
        return "";
    }
  };

  return (
    <div className={cn("border-b last:border-b-0", getBgColor())}>
      <button
        onClick={() => log.data && setExpanded(!expanded)}
        className="w-full p-2 flex items-start gap-2 text-left hover:bg-accent/50 transition-colors"
      >
        {log.data ? (
          expanded ? <ChevronDown className="size-3 mt-0.5" /> : <ChevronRight className="size-3 mt-0.5" />
        ) : (
          <span className="w-3" />
        )}
        {getIcon()}
        <div className="flex-1 min-w-0">
          <div className="text-xs truncate">{log.message}</div>
          <div className="text-[10px] text-muted-foreground">
            {new Date(log.timestamp).toLocaleTimeString()}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {log.blockId}
        </Badge>
      </button>
      
      {expanded && log.data && (
        <div className="px-8 pb-2">
          <pre className="text-[10px] bg-muted p-2 rounded overflow-auto max-h-24">
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
}: DebugPanelProps) {
  const [payload, setPayload] = useState("{}");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [executionLogs]);

  // Check if any block is running
  const hasRunningBlocks = Object.values(blockStatuses).some((s) => s === "running");

  // Start test execution
  const handleTest = async () => {
    setError(null);
    setIsRunning(true);

    let payloadObj: Record<string, unknown> = {};
    try {
      payloadObj = JSON.parse(payload);
    } catch {
      setError("Invalid JSON payload");
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
        if (data.type === "block.start" || data.type === "block.complete" || data.type === "block.error") {
          onBlockEvent(data as BlockEvent);
        }
        if (data.type === "workflow.complete" || data.type === "workflow.error") {
          setIsRunning(false);
          eventSource.close();
        }
      } catch {
        console.error("Failed to parse SSE event:", event.data);
      }
    };

    eventSource.onerror = () => {
      setError("Connection lost");
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

  const completedCount = Object.values(blockStatuses).filter((s) => s === "completed").length;
  const errorCount = Object.values(blockStatuses).filter((s) => s === "error").length;
  const totalBlocks = workflow.blocks?.length || 0;

  return (
    <div className={cn("flex flex-col h-full bg-card border-l", className)}>
      <div className="p-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Zap className="size-4" />
            Test Workflow
          </h3>
          {isRunning && (
            <Badge variant="secondary" className="animate-pulse">
              <Loader2 className="size-3 mr-1 animate-spin" />
              Running
            </Badge>
          )}
        </div>
        
        {/* Progress indicator */}
        {(completedCount > 0 || errorCount > 0) && (
          <div className="flex items-center gap-2 text-xs mb-2">
            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
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

      <Tabs defaultValue="payload" className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-2">
          <TabsTrigger value="payload" className="text-xs">Payload</TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">
            Logs
            {executionLogs.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1">
                {executionLogs.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payload" className="flex-1 p-3 pt-2">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
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

            {error && (
              <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              {isRunning ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleStop}
                  className="flex-1"
                >
                  <Square className="size-4 mr-1" />
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleTest}
                  className="flex-1"
                >
                  <Play className="size-4 mr-1" />
                  Run Test
                </Button>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              <p>The workflow will be executed with this payload as the trigger data.</p>
              <p className="mt-1">Access via: <code className="bg-muted px-1 rounded">trigger.payload</code></p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              {executionLogs.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  <Clock className="size-8 mx-auto mb-2 opacity-50" />
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
            <div className="p-2 border-t">
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs"
                onClick={() => {
                  // This should call clearExecutionState from parent
                  // For now, just a placeholder
                }}
              >
                <Trash2 className="size-3 mr-1" />
                Clear Logs
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

