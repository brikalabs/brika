/**
 * Agent Run Inspector
 *
 * Renders a recorded AI Agent run as a legible call-tool -> observe -> reply
 * timeline, distinct from the flat event list. It reads the structured data the
 * agent persists on its output ports: each `toolCall` emit (tool + result), the
 * final `reply`, and any `error`. Detection is structural (the agent's output
 * ports), never message-parsing.
 *
 * Per-iteration reasoning and token cost are logged by the agent loop but are
 * not yet persisted as run-event data (block logs carry no structured payload
 * today); surfacing those here is a follow-up that adds a structured-trace
 * channel.
 */

import { Badge, cn, ScrollArea } from '@brika/clay';
import { AlertTriangle, CheckCircle, MessageSquare, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RunEvent, WorkflowRun } from '../api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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
  | { kind: 'tool'; ts: number; tool: string; result: string }
  | { kind: 'reply'; ts: number; text: string }
  | { kind: 'error'; ts: number; message: string };

function buildTimeline(events: ReadonlyArray<RunEvent>): Entry[] {
  const out: Entry[] = [];
  for (const e of events) {
    if (e.kind === 'block.emit' && e.port === 'toolCall' && isRecord(e.data)) {
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
        {duration !== undefined && (
          <span className="ml-auto text-muted-foreground text-xs">
            {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>
      <ScrollArea className="h-90">
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
