import { Loader2, Pause, Play, Send, Trash2, Zap } from 'lucide-react';
import React from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  ScrollArea,
  Textarea,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useEmitEvent, useEventStream } from './hooks';

export function EventsPage() {
  const { t, formatTime } = useLocale();
  const { events, paused, clear, togglePaused } = useEventStream();
  const emitEvent = useEmitEvent();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [type, setType] = React.useState('test.event');
  const [payload, setPayload] = React.useState('{"message": "hello"}');

  const handleEmit = async () => {
    try {
      await emitEvent.mutateAsync({ type, payload: JSON.parse(payload) });
      setDialogOpen(false);
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-2xl tracking-tight">{t('events:title')}</h2>
          <p className="text-muted-foreground">{t('events:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={paused ? 'default' : 'secondary'}
            onClick={togglePaused}
            className="gap-2"
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? t('events:actions.resume') : t('events:actions.pause')}
          </Button>
          <Button variant="outline" onClick={clear} className="gap-2">
            <Trash2 className="size-4" />
            {t('events:actions.clear')}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Send className="size-4" />
                {t('events:actions.emit')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('events:dialog.title')}</DialogTitle>
                <DialogDescription>{t('events:dialog.description')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('events:labels.type')}</Label>
                  <Input
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    placeholder="motion.detected"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('events:labels.payload')}</Label>
                  <Textarea
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                    className="min-h-[100px] font-mono text-sm"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  {t('common:actions.cancel')}
                </Button>
                <Button onClick={handleEmit} disabled={emitEvent.isPending} className="gap-2">
                  {emitEvent.isPending && <Loader2 className="size-4 animate-spin" />}
                  {t('events:actions.emit')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-2">
        <Badge variant="secondary">{events.length}</Badge>
        {paused && <Badge variant="outline">{t('events:paused')}</Badge>}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {events.length === 0 ? (
              <div className="p-12 text-center">
                <Zap className="mx-auto mb-4 size-12 text-muted-foreground" />
                <h3 className="font-semibold">{t('events:empty')}</h3>
                <p className="mt-1 text-muted-foreground">{t('events:emptyHint')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {events.map((e) => (
                  <div key={e.id} className="px-4 py-3 hover:bg-muted/30">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                          <Zap className="size-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-mono font-semibold text-sm">{e.type}</div>
                          <div className="text-muted-foreground text-xs">
                            {t('events:from')} {e.source}
                          </div>
                        </div>
                      </div>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {formatTime(e.ts)}
                      </span>
                    </div>
                    {e.payload && (
                      <pre className="mt-2 ml-11 max-h-20 overflow-auto rounded bg-muted/50 p-2 text-muted-foreground text-xs">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
