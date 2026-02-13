/**
 * Debug Components
 *
 * Shared components for displaying debug events.
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { DebugEvent } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a timestamp for display in debug logs.
 * Returns format: HH:MM:SS.mmm
 */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleTimeString('en-US', { hour12: false }) +
    '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Type Styling
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-muted-foreground',
  info: 'text-info',
  warn: 'text-warning',
  error: 'text-destructive',
};

const LEVEL_BADGE_COLORS: Record<string, string> = {
  debug: 'bg-muted',
  info: 'bg-info',
  warn: 'bg-warning',
  error: 'bg-destructive',
};

function getEventBadgeColor(event: DebugEvent): string {
  if (event.type === 'block.emit') return 'bg-data-1';
  if (event.type === 'block.log') return LEVEL_BADGE_COLORS[event.level ?? 'info'] ?? 'bg-muted';
  if (event.type.includes('error')) return 'bg-destructive';
  if (event.type === 'init') return 'bg-muted';
  return 'bg-muted';
}

function getEventBadgeLabel(event: DebugEvent): string {
  if (event.type === 'block.emit') return 'EMIT';
  if (event.type === 'block.log') return 'LOG';
  if (event.type === 'init') return 'INIT';
  if (event.type.includes('error')) return 'ERR';
  return event.type.split('.').pop()?.toUpperCase() || 'EVT';
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug Event Entry (Simple)
// ─────────────────────────────────────────────────────────────────────────────

export interface DebugEventEntryProps {
  event: DebugEvent;
  /** Show workflow ID prefix for multi-workflow views */
  showWorkflowId?: boolean;
}

/**
 * Simple debug event entry - single line display.
 * Good for compact views like dialogs.
 */
export function DebugEventEntry({ event, showWorkflowId }: Readonly<DebugEventEntryProps>) {
  const isEmit = event.type === 'block.emit';
  const isLog = event.type === 'block.log';
  const isInit = event.type === 'init';

  if (isInit) {
    return (
      <div className="flex gap-2 py-1 font-mono text-xs">
        <span className="text-muted-foreground">{formatTimestamp(event.timestamp)}</span>
        <Badge variant="outline" className="px-1 text-[10px]">
          INIT
        </Badge>
        <span className="text-muted-foreground">Connected to debug stream</span>
      </div>
    );
  }

  if (isLog) {
    return (
      <div className="flex gap-2 py-1 font-mono text-xs">
        <span className="text-muted-foreground">{formatTimestamp(event.timestamp)}</span>
        <Badge
          variant="default"
          className={cn(
            'px-1 text-[10px]',
            LEVEL_BADGE_COLORS[event.level ?? 'info'] ?? 'bg-gray-600'
          )}
        >
          LOG
        </Badge>
        {showWorkflowId && event.workflowId && (
          <span className="text-data-5">{event.workflowId}</span>
        )}
        <span className="text-data-5">{event.blockId}</span>
        <span className={LEVEL_COLORS[event.level ?? 'info'] ?? 'text-gray-400'}>
          [{event.level?.toUpperCase()}]
        </span>
        <span className="text-foreground">{event.message}</span>
      </div>
    );
  }

  if (isEmit) {
    return (
      <div className="flex gap-2 py-1 font-mono text-xs">
        <span className="text-muted-foreground">{formatTimestamp(event.timestamp)}</span>
        <Badge variant="default" className="bg-data-1 px-1 text-[10px]">
          EMIT
        </Badge>
        {showWorkflowId && event.workflowId && (
          <span className="text-data-5">{event.workflowId}</span>
        )}
        <span className="text-data-7">{event.blockId}</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-data-6">{event.port}</span>
        <span className="max-w-[300px] truncate text-success">{JSON.stringify(event.data)}</span>
      </div>
    );
  }

  return (
    <div className="flex gap-2 py-1 font-mono text-xs">
      <span className="text-muted-foreground">{formatTimestamp(event.timestamp)}</span>
      <Badge variant="secondary" className="px-1 text-[10px]">
        {event.type}
      </Badge>
      <span className="text-muted-foreground">{JSON.stringify(event)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug Event Entry (Expandable)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExpandableEventEntryProps {
  event: DebugEvent;
}

/**
 * Expandable debug event entry with collapsible data payload.
 * Good for detailed views like the editor panel.
 */
export function ExpandableEventEntry({ event }: Readonly<ExpandableEventEntryProps>) {
  const [expanded, setExpanded] = useState(false);
  const hasData = event.data !== undefined && event.data !== null;

  const isEmit = event.type === 'block.emit';
  const isLog = event.type === 'block.log';

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => hasData && setExpanded(!expanded)}
        className={cn(
          'flex w-full items-start gap-2 p-2 text-left transition-colors hover:bg-muted/50',
          hasData && 'cursor-pointer'
        )}
      >
        {hasData && expanded && (
          <ChevronDown className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
        )}
        {hasData && !expanded && (
          <ChevronRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
        )}
        {!hasData && <span className="w-3 shrink-0" />}

        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {formatTimestamp(event.timestamp)}
        </span>

        <Badge className={cn('shrink-0 px-1.5 py-0 text-[9px]', getEventBadgeColor(event))}>
          {getEventBadgeLabel(event)}
        </Badge>

        <div className="min-w-0 flex-1 font-mono text-xs">
          {isEmit && (
            <>
              <span className="text-data-7">{event.blockId}</span>
              <span className="text-muted-foreground"> → </span>
              <span className="text-data-6">{event.port}</span>
            </>
          )}
          {isLog && (
            <>
              <span className="text-data-7">{event.blockId}</span>
              <span className="text-muted-foreground">: </span>
              <span className="text-foreground">{event.message}</span>
            </>
          )}
          {!isEmit && !isLog && (
            <span className="text-muted-foreground">{event.blockId || event.type}</span>
          )}
        </div>
      </button>

      {expanded && hasData && (
        <div className="px-8 pb-2">
          <pre className="max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-[10px] text-foreground">
            {JSON.stringify(event.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Filter Buttons
// ─────────────────────────────────────────────────────────────────────────────

type EventFilterType = 'all' | 'logs' | 'emits';

export interface EventFilterButtonsProps {
  filter: EventFilterType;
  onChange: (filter: EventFilterType) => void;
  labels?: {
    all?: string;
    logs?: string;
    emits?: string;
  };
  className?: string;
}

/**
 * Filter buttons for switching between all/logs/emits views.
 */
export function EventFilterButtons({
  filter,
  onChange,
  labels,
  className,
}: Readonly<EventFilterButtonsProps>) {
  const ButtonClass = (active: boolean) =>
    cn(
      'h-6 rounded-md border px-2 text-xs transition-colors',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-transparent text-muted-foreground hover:bg-accent'
    );

  return (
    <div className={cn('flex gap-1', className)}>
      <button
        type="button"
        className={ButtonClass(filter === 'all')}
        onClick={() => onChange('all')}
      >
        {labels?.all ?? 'All'}
      </button>
      <button
        type="button"
        className={ButtonClass(filter === 'logs')}
        onClick={() => onChange('logs')}
      >
        {labels?.logs ?? 'Logs'}
      </button>
      <button
        type="button"
        className={ButtonClass(filter === 'emits')}
        onClick={() => onChange('emits')}
      >
        {labels?.emits ?? 'Emits'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter debug events by type.
 */
export function filterEvents(events: DebugEvent[], filter: 'all' | 'logs' | 'emits'): DebugEvent[] {
  if (filter === 'all') return events;
  if (filter === 'logs') return events.filter((e) => e.type === 'block.log' || e.type === 'init');
  if (filter === 'emits') return events.filter((e) => e.type === 'block.emit' || e.type === 'init');
  return events;
}
