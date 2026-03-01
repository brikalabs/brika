import { Clock, Pause, Play, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, ScrollArea } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useEmitEvent, useSparkStream } from '../sparks-hooks';
import { CustomEmitDialog } from './CustomEmitDialog';
import { EventRow } from './EventRow';

export function EventStreamTab() {
  const { t, formatTime } = useLocale();
  const { events, paused, clear, togglePaused } = useSparkStream();
  const emitEvent = useEmitEvent();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleResend = async (eventId: string, type: string, payload: unknown) => {
    setResendingId(eventId);
    try {
      await emitEvent.mutateAsync({
        type,
        payload,
      });
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={paused ? 'default' : 'secondary'}
          size="sm"
          onClick={togglePaused}
          className="gap-2"
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          {paused ? t('sparks:actions.resume') : t('sparks:actions.pause')}
        </Button>
        <Button variant="outline" size="sm" onClick={clear} className="gap-2">
          <Trash2 className="size-4" />
          {t('sparks:actions.clear')}
        </Button>
        <Button size="sm" className="gap-2" onClick={() => setDialogOpen(true)}>
          <Send className="size-4" />
          {t('sparks:actions.emitCustom')}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">{events.length}</Badge>
          {paused && <Badge variant="outline">{t('sparks:paused')}</Badge>}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <ScrollArea className="h-125">
            {events.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="mx-auto mb-4 size-12 text-muted-foreground" />
                <h3 className="font-semibold">{t('sparks:emptyStream')}</h3>
                <p className="mt-1 text-muted-foreground">{t('sparks:emptyStreamHint')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {events.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    resending={resendingId === e.id}
                    onResend={() => handleResend(e.id, e.type, e.payload)}
                    formatTime={formatTime}
                    t={t}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <CustomEmitDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
