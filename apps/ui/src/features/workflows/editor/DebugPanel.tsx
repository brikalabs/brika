/**
 * Debug Panel
 *
 * Live workflow debugging with real-time event streaming via SSE.
 * Auto-connects to the global debug endpoint and filters by workflow ID.
 */

import { ChevronRight, Radio, Trash2, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
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
  onCollapse?: () => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug Panel
// ─────────────────────────────────────────────────────────────────────────────

export function DebugPanel({ workflow, onCollapse, className }: Readonly<DebugPanelProps>) {
  const { t } = useLocale();
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
    <div className={cn('flex h-full flex-col border-l bg-card/50 backdrop-blur-sm', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-background/80 px-3 py-2">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-yellow-500" />
          <span className="font-medium text-sm">{t('workflows:debug.title')}</span>
          {connected ? (
            <Badge
              variant="outline"
              className="border-green-500/50 bg-green-500/10 px-1.5 py-0 text-[10px] text-green-600 dark:text-green-400"
            >
              <Radio className="mr-1 size-2 animate-pulse" />
              {t('workflows:debug.connected')}
            </Badge>
          ) : (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {t('workflows:debug.disconnected')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className={cn('h-6 px-2 text-[10px]', showAll && 'bg-muted')}
            onClick={() => setShowAll(!showAll)}
          >
            {t('workflows:debug.all')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-muted-foreground hover:text-foreground"
            onClick={clear}
            title={t('workflows:debug.clear')}
          >
            <Trash2 className="size-3" />
          </Button>
          {onCollapse && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  onClick={onCollapse}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{t('workflows:editor.panels.collapse')}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <EventFilterButtons filter={filter} onChange={setFilter} />
      </div>

      {/* Events */}
      <ScrollArea className="min-h-0 flex-1 overflow-hidden" ref={scrollRef}>
        {filteredEvents.length === 0 ? (
          <div className="flex h-full items-center justify-center py-12">
            <div className="text-center">
              <Zap className="mx-auto mb-2 size-8 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">
                {t('workflows:editor.panels.waitingForEvents')}
              </p>
              <p className="text-muted-foreground/70 text-xs">
                {t('workflows:editor.panels.enableWorkflow')}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {filteredEvents.map((event, i) => (
              <ExpandableEventEntry key={`${event.timestamp}-${i}`} event={event} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="flex items-center justify-between border-t bg-background/80 px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground">
          {filter === 'all'
            ? `${filteredEvents.length} ${t('workflows:debug.events')}`
            : `${filteredEvents.length} / ${events.length} ${t('workflows:debug.events')}`}
          {showAll && ` (${t('workflows:debug.all').toLowerCase()})`}
        </span>
        <span className="text-[10px] text-muted-foreground/70">{workflow.id}</span>
      </div>
    </div>
  );
}
