import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Status,
  StatusIndicator,
  StatusLabel,
} from '@brika/clay';
import { Bug } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { useLocale } from '@/lib/use-locale';
import {
  DebugEventEntry,
  type DebugFilter,
  EventFilterButtons,
  filterEvents,
  useDebugStream,
} from '../debug';
import { RunsView } from './RunsView';

type DebugView = 'live' | 'runs';

interface DebugDialogProps {
  workflowId: string | null;
  workflowName?: string;
  open: boolean;
  onClose: () => void;
}

export function DebugDialog({
  workflowId,
  workflowName,
  open,
  onClose,
}: Readonly<DebugDialogProps>) {
  const { t } = useLocale();
  const capture = useCapture();
  const [filter, setFilter] = useState<DebugFilter>('all');
  const [view, setView] = useState<DebugView>('live');
  const scrollRef = useRef<HTMLDivElement>(null);

  const tabClass = (active: boolean) =>
    cn(
      'h-6 rounded-md border px-2 text-xs transition-colors',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-transparent text-muted-foreground hover:bg-accent'
    );

  // Use shared debug stream hook
  const { events, connected, clear } = useDebugStream({
    workflowId,
    enabled: open && !!workflowId,
    maxEvents: 500,
  });

  // Filter events
  const filteredEvents = filterEvents(events, filter);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEvents]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Bug className="size-5" />
              {t('workflows:debug.title')}
              {connected ? (
                <Status variant="success" className="text-[10px]">
                  <StatusIndicator />
                  <StatusLabel>{t('workflows:debug.connected')}</StatusLabel>
                </Status>
              ) : (
                <Status variant="neutral" className="text-[10px]">
                  <StatusIndicator pulse={false} />
                  <StatusLabel>{t('workflows:debug.disconnected')}</StatusLabel>
                </Status>
              )}
            </DialogTitle>
          </div>
          <DialogDescription className="flex items-center justify-between gap-2">
            <span className="truncate">{workflowName || workflowId}</span>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  className={tabClass(view === 'live')}
                  onClick={() => setView('live')}
                >
                  {t('workflows:debug.live')}
                </button>
                <button
                  type="button"
                  className={tabClass(view === 'runs')}
                  onClick={() => setView('runs')}
                >
                  {t('workflows:runs.title')}
                </button>
              </div>
              {view === 'live' && (
                <EventFilterButtons
                  filter={filter}
                  onChange={(next) => {
                    capture('workflow.debug_filter_changed', { filter: next });
                    setFilter(next);
                  }}
                  labels={{
                    all: t('workflows:debug.all'),
                    logs: t('workflows:debug.logsOnly'),
                    emits: t('workflows:debug.emitsOnly'),
                  }}
                />
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {view === 'live' ? (
          <div className="rounded-lg border bg-muted/50 p-2">
            <ScrollArea className="h-100" ref={scrollRef}>
              {filteredEvents.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  {t('workflows:debug.waiting')}
                </div>
              ) : (
                <div className="space-y-0">
                  {filteredEvents.map((event, i) => (
                    <DebugEventEntry key={`${event.timestamp}-${i}`} event={event} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <RunsView workflowId={workflowId} />
        )}

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {view === 'live' &&
                (filter === 'all'
                  ? `${events.length} ${t('workflows:debug.events')}`
                  : `${filteredEvents.length} / ${events.length} ${t('workflows:debug.events')}`)}
            </span>
            <div className="flex gap-2">
              {view === 'live' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    capture('workflow.debug_cleared', { eventCount: events.length });
                    clear();
                  }}
                >
                  {t('workflows:debug.clear')}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  capture('workflow.debug_closed', { eventCount: events.length });
                  onClose();
                }}
              >
                {t('common:actions.close')}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
