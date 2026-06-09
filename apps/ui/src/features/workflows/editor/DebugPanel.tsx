/**
 * Debug Panel
 *
 * Run-centric observability for the editor. The default tab is the recorded
 * Runs history (click a run for its per-block timeline); the Live tab is the
 * raw real-time event stream via SSE.
 */

import {
  Button,
  cn,
  ScrollArea,
  Status,
  StatusIndicator,
  StatusLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@brika/clay';
import { ChevronRight, History, Trash2, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { useLocale } from '@/lib/use-locale';
import type { Workflow } from '../api';
import { RunsView } from '../components/RunsView';
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

type DebugTab = 'runs' | 'live';

export function DebugPanel({ workflow, onCollapse, className }: Readonly<DebugPanelProps>) {
  const { t } = useLocale();
  const capture = useCapture();
  const [tab, setTab] = useState<DebugTab>('runs');
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<DebugFilter>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const switchTab = (next: DebugTab) => {
    capture('workflow.debug_panel_tab_changed', { tab: next });
    setTab(next);
  };

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
          {tab === 'live' && connected ? (
            <Status variant="success" className="px-1.5 py-0 text-[10px]">
              <StatusIndicator />
              <StatusLabel>{t('workflows:debug.connected')}</StatusLabel>
            </Status>
          ) : null}
          {tab === 'live' && !connected ? (
            <Status variant="neutral" className="px-1.5 py-0 text-[10px]">
              <StatusIndicator pulse={false} />
              <StatusLabel>{t('workflows:debug.disconnected')}</StatusLabel>
            </Status>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {tab === 'live' && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className={cn('h-6 px-2 text-[10px]', showAll && 'bg-muted')}
                onClick={() => {
                  capture('workflow.debug_panel_scope_toggled', { showAll: !showAll });
                  setShowAll(!showAll);
                }}
              >
                {t('workflows:debug.all')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  capture('workflow.debug_panel_cleared', { eventCount: events.length });
                  clear();
                }}
                title={t('workflows:debug.clear')}
              >
                <Trash2 className="size-3" />
              </Button>
            </>
          )}
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

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b px-3 py-1.5">
        <Button
          size="sm"
          variant={tab === 'runs' ? 'secondary' : 'ghost'}
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={() => switchTab('runs')}
        >
          <History className="size-3" />
          {t('workflows:debug.tabs.runs')}
        </Button>
        <Button
          size="sm"
          variant={tab === 'live' ? 'secondary' : 'ghost'}
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={() => switchTab('live')}
        >
          <Zap className="size-3" />
          {t('workflows:debug.tabs.live')}
        </Button>
        {tab === 'live' && (
          <div className="ml-auto">
            <EventFilterButtons
              filter={filter}
              onChange={(next) => {
                capture('workflow.debug_panel_filter_changed', { filter: next });
                setFilter(next);
              }}
            />
          </div>
        )}
      </div>

      {/* Runs history */}
      {tab === 'runs' && (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <RunsView workflowId={workflow.id} />
        </div>
      )}

      {/* Events */}
      {tab === 'live' && (
        <ScrollArea
          className="[&_[data-radix-scroll-area-viewport]>div]:block! min-h-0 flex-1 overflow-hidden [&_[data-radix-scroll-area-viewport]>div]:w-full [&_[data-radix-scroll-area-viewport]>div]:max-w-full"
          ref={scrollRef}
        >
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
      )}

      {/* Footer */}
      {tab === 'live' && (
        <div className="flex items-center justify-between border-t bg-background/80 px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground">
            {filter === 'all'
              ? `${filteredEvents.length} ${t('workflows:debug.events')}`
              : `${filteredEvents.length} / ${events.length} ${t('workflows:debug.events')}`}
            {showAll && ` (${t('workflows:debug.all').toLowerCase()})`}
          </span>
          <span className="text-[10px] text-muted-foreground/70">{workflow.id}</span>
        </div>
      )}
    </div>
  );
}
