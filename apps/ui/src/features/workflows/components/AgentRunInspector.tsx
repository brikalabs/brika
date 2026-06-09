/**
 * Agent Run Inspector
 *
 * Renders a recorded AI Agent run as a legible reason -> call-tool -> observe
 * -> reply timeline, distinct from the flat event list. It reads the
 * structured data the agent persists: per-iteration `block.log` trace entries
 * (reasoning preview, token usage, running cost) plus each `toolCall` emit
 * (tool + result), the final `reply`, and any `error`. Detection is structural
 * (the agent's output ports), never message-parsing.
 */

import { Badge, cn, ScrollArea } from '@brika/clay';
import { AlertTriangle, Brain, CheckCircle, MessageSquare, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RunEvent, WorkflowRun } from '../api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/** The agent block's output ports — their presence identifies an agent run. */
const AGENT_PORTS = new Set(['reply', 'toolCall']);

/** True when a run carries the AI Agent block's distinctive output emits. */
export function isAgentRun(events: ReadonlyArray<RunEvent>): boolean {
  return events.some(
    (e) => e.kind === 'block.emit' && e.port !== undefined && AGENT_PORTS.has(e.port)
  );
}

type Entry =
  | {
      kind: 'step';
      ts: number;
      iteration: number;
      maxIterations?: number;
      reasoning?: string;
      stepTokens?: number;
      cumulativeCostUsd?: number;
    }
  | { kind: 'tool'; ts: number; tool: string; result: string }
  | { kind: 'reply'; ts: number; text: string }
  | { kind: 'error'; ts: number; message: string };

/** Per-iteration trace entries arrive as block.log events carrying `iteration`. */
function stepEntry(e: RunEvent): Entry | null {
  if (e.kind !== 'block.log' || !isRecord(e.data)) {
    return null;
  }
  const iteration = asNumber(e.data.iteration);
  if (iteration === undefined) {
    return null;
  }
  return {
    kind: 'step',
    ts: e.ts,
    iteration,
    maxIterations: asNumber(e.data.maxIterations),
    reasoning: asString(e.data.reasoning),
    stepTokens: asNumber(e.data.stepTokens),
    cumulativeCostUsd: asNumber(e.data.cumulativeCostUsd),
  };
}

/** The run's final cost: the run-summary log if present, else the last step's. */
function runCostUsd(events: ReadonlyArray<RunEvent>): number | undefined {
  let cost: number | undefined;
  for (const e of events) {
    if (e.kind !== 'block.log' || !isRecord(e.data)) {
      continue;
    }
    cost = asNumber(e.data.costUsd) ?? asNumber(e.data.cumulativeCostUsd) ?? cost;
  }
  return cost;
}

function buildTimeline(events: ReadonlyArray<RunEvent>): Entry[] {
  const out: Entry[] = [];
  for (const e of events) {
    const step = stepEntry(e);
    if (step) {
      out.push(step);
    } else if (e.kind === 'block.emit' && e.port === 'toolCall' && isRecord(e.data)) {
      out.push({
        kind: 'tool',
        ts: e.ts,
        tool: asString(e.data.tool) ?? 'tool',
        result: asString(e.data.result) ?? '',
      });
    } else if (e.kind === 'block.emit' && e.port === 'reply') {
      out.push({ kind: 'reply', ts: e.ts, text: asString(e.data) ?? '' });
    } else if (e.kind === 'block.error' || (e.kind === 'block.emit' && e.port === 'error')) {
      const message = isRecord(e.data)
        ? (asString(e.data.message) ?? '')
        : (asString(e.data) ?? e.message ?? 'Error');
      out.push({ kind: 'error', ts: e.ts, message });
    }
  }
  return out;
}

function TimelineRow({
  icon,
  tone,
  children,
}: Readonly<{ icon: ReactNode; tone: string; children: ReactNode }>) {
  return (
    <div className="flex gap-2.5">
      <div
        className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', tone)}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 pb-3">{children}</div>
    </div>
  );
}

function renderEntry(entry: Entry, index: number): ReactNode {
  const key = `${entry.kind}-${index}`;
  if (entry.kind === 'step') {
    return (
      <TimelineRow key={key} icon={<Brain className="size-3.5" />} tone="bg-data-7/15 text-data-7">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-xs">
            Step {entry.iteration}
            {entry.maxIterations !== undefined ? ` / ${entry.maxIterations}` : ''}
          </p>
          {entry.stepTokens !== undefined && (
            <Badge variant="outline" className="text-[9px]">
              {entry.stepTokens} tokens
            </Badge>
          )}
          {entry.cumulativeCostUsd !== undefined && (
            <Badge variant="outline" className="text-[9px]">
              ${entry.cumulativeCostUsd.toFixed(4)}
            </Badge>
          )}
        </div>
        {entry.reasoning && (
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
            {entry.reasoning}
          </p>
        )}
      </TimelineRow>
    );
  }
  if (entry.kind === 'tool') {
    return (
      <TimelineRow key={key} icon={<Wrench className="size-3.5" />} tone="bg-data-1/15 text-data-1">
        <p className="font-medium font-mono text-xs">{entry.tool}</p>
        {entry.result && (
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 text-[10px] text-muted-foreground">
            {entry.result}
          </pre>
        )}
      </TimelineRow>
    );
  }
  if (entry.kind === 'reply') {
    return (
      <TimelineRow
        key={key}
        icon={<CheckCircle className="size-3.5" />}
        tone="bg-status-completed/15 text-status-completed"
      >
        <p className="font-medium text-sm">Reply</p>
        <p className="mt-1 whitespace-pre-wrap text-foreground text-xs">{entry.text}</p>
      </TimelineRow>
    );
  }
  return (
    <TimelineRow
      key={key}
      icon={<AlertTriangle className="size-3.5" />}
      tone="bg-destructive/15 text-destructive"
    >
      <p className="font-medium text-destructive text-sm">Error</p>
      <p className="mt-1 whitespace-pre-wrap text-destructive text-xs">{entry.message}</p>
    </TimelineRow>
  );
}

/** Tool-call / reply / error timeline for a recorded AI Agent run. */
export function AgentRunInspector({
  run,
  events,
}: Readonly<{ run: WorkflowRun; events: ReadonlyArray<RunEvent> }>) {
  const timeline = buildTimeline(events);
  const toolCalls = timeline.filter((e) => e.kind === 'tool').length;
  const cost = runCostUsd(events);
  const duration =
    run.finishedAt === undefined ? undefined : Math.max(0, run.finishedAt - run.startedAt);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        <MessageSquare className="size-4 text-data-7" />
        <span className="font-medium text-sm">Agent run</span>
        <Badge variant="outline" className="text-[10px]">
          {toolCalls} {toolCalls === 1 ? 'tool call' : 'tool calls'}
        </Badge>
        {cost !== undefined && (
          <Badge variant="outline" className="text-[10px]">
            ${cost.toFixed(4)}
          </Badge>
        )}
        {duration !== undefined && (
          <span className="ml-auto text-muted-foreground text-xs">
            {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>
      <ScrollArea className="[&_[data-radix-scroll-area-viewport]>div]:block! h-90 [&_[data-radix-scroll-area-viewport]>div]:w-full [&_[data-radix-scroll-area-viewport]>div]:max-w-full">
        {timeline.length > 0 ? (
          <div className="pt-1">{timeline.map((entry, i) => renderEntry(entry, i))}</div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No agent activity recorded
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
