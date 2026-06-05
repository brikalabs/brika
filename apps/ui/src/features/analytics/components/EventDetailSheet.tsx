import {
  Button,
  ScrollArea,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@brika/clay';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import type { StoredCaptureEvent } from '../types';
import { EventName, SourceBadge } from './event-ui';

interface EventDetailSheetProps {
  event: StoredCaptureEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function MetaRow({
  label,
  value,
  empty,
}: Readonly<{ label: string; value: string | undefined; empty: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      {value ? (
        <span className="truncate font-mono text-xs">{value}</span>
      ) : (
        <span className="text-muted-foreground/60 text-xs italic">{empty}</span>
      )}
    </div>
  );
}

export function EventDetailSheet({ event, open, onOpenChange }: Readonly<EventDetailSheetProps>) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  const copyJson = () => {
    if (!event) {
      return;
    }
    void navigator.clipboard.writeText(JSON.stringify(event, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        {event && (
          <>
            <SheetHeader className="space-y-2 border-border/50 border-b p-5">
              <SheetTitle className="text-base">
                <EventName name={event.name} />
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <SourceBadge source={event.source} />
                {event.pluginName && <span className="font-mono text-xs">{event.pluginName}</span>}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-5 p-5">
                <div className="space-y-1.5">
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('analytics:detail.when')}
                  </p>
                  <p className="text-sm tabular-nums">{new Date(event.ts).toLocaleString()}</p>
                </div>

                <Separator className="bg-border/50" />

                <div className="space-y-2">
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {t('analytics:detail.identity')}
                  </p>
                  <MetaRow
                    label="distinctId"
                    value={event.distinctId}
                    empty={t('analytics:detail.notAuthenticated')}
                  />
                  <MetaRow
                    label="userId"
                    value={event.userId}
                    empty={t('analytics:detail.notAuthenticated')}
                  />
                </div>

                <Separator className="bg-border/50" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      {t('analytics:detail.properties')}
                    </p>
                    {event.props && (
                      <Button variant="ghost" size="sm" className="h-6 gap-1.5" onClick={copyJson}>
                        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        {copied ? t('analytics:detail.copied') : t('analytics:detail.copy')}
                      </Button>
                    )}
                  </div>
                  {event.props ? (
                    <pre className="overflow-x-auto rounded-md border border-border/50 bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                      {JSON.stringify(event.props, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground text-sm">{t('analytics:detail.noProps')}</p>
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
