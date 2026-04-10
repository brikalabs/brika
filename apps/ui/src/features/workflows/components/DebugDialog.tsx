import { Bug } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import {
  DebugEventEntry,
  type DebugFilter,
  EventFilterButtons,
  filterEvents,
  useDebugStream,
} from '../debug';

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
  const [filter, setFilter] = useState<DebugFilter>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

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
                <Badge variant="default" className="bg-success text-[10px]">
                  {t('workflows:debug.connected')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {t('workflows:debug.disconnected')}
                </Badge>
              )}
            </DialogTitle>
          </div>
          <DialogDescription className="flex items-center justify-between">
            <span>{workflowName || workflowId}</span>
            <EventFilterButtons
              filter={filter}
              onChange={setFilter}
              labels={{
                all: t('workflows:debug.all'),
                logs: t('workflows:debug.logsOnly'),
                emits: t('workflows:debug.emitsOnly'),
              }}
            />
          </DialogDescription>
        </DialogHeader>

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

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {filter === 'all'
                ? `${events.length} ${t('workflows:debug.events')}`
                : `${filteredEvents.length} / ${events.length} ${t('workflows:debug.events')}`}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clear}>
                {t('workflows:debug.clear')}
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>
                {t('common:actions.close')}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
