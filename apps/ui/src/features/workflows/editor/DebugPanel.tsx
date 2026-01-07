/**
 * Debug Panel
 *
 * Live workflow debugging with real-time event streaming via SSE.
 * Auto-connects to the global debug endpoint and filters by workflow ID.
 */

import { Radio, Trash2, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, ScrollArea } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Workflow } from '../api';
import {
  type DebugFilter,
  EventFilterButtons,
  ExpandableEventEntry,
  filterEvents,
  useDebugStream,
} from '../debug';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DebugPanelProps {
  workflow: Workflow;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug Panel
// ─────────────────────────────────────────────────────────────────────────────

export function DebugPanel({ workflow, className }: Readonly<DebugPanelProps>) {
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<DebugFilter>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use shared debug stream hook
  const { events, connected, clear } = useDebugStream({
    workflowId: showAll ? undefined : workflow.id,
    maxEvents: 200,
  });

  // Filter events by type
  const filteredEvents = filterEvents(events, filter);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEvents]);

  return (
    <div className={cn('flex h-full flex-col border-l bg-zinc-950', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-zinc-800 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-yellow-500" />
          <span className="font-medium text-sm text-zinc-200">Live</span>
          {connected ? (
            <Badge
              variant="outline"
              className="border-green-600 px-1.5 py-0 text-[10px] text-green-500"
            >
              <Radio className="mr-1 size-2 animate-pulse" />
              Connected
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-zinc-600 px-1.5 py-0 text-[10px] text-zinc-500"
            >
              Disconnected
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className={cn('h-6 px-2 text-[10px]', showAll && 'bg-zinc-800')}
            onClick={() => setShowAll(!showAll)}
          >
            All
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-zinc-400 hover:text-zinc-200"
            onClick={clear}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center justify-between border-zinc-800 border-b px-3 py-1.5">
        <EventFilterButtons filter={filter} onChange={setFilter} />
      </div>

      {/* Events */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        {filteredEvents.length === 0 ? (
          <div className="flex h-full items-center justify-center py-12">
            <div className="text-center">
              <Zap className="mx-auto mb-2 size-8 text-zinc-700" />
              <p className="text-sm text-zinc-500">Waiting for events...</p>
              <p className="text-xs text-zinc-600">Enable the workflow to see live data</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filteredEvents.map((event, i) => (
              <ExpandableEventEntry key={`${event.timestamp}-${i}`} event={event} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="flex items-center justify-between border-zinc-800 border-t px-3 py-1.5">
        <span className="text-[10px] text-zinc-500">
          {filter !== 'all'
            ? `${filteredEvents.length} / ${events.length} events`
            : `${filteredEvents.length} events`}
          {showAll && ' (all workflows)'}
        </span>
        <span className="text-[10px] text-zinc-600">{workflow.id}</span>
      </div>
    </div>
  );
}
