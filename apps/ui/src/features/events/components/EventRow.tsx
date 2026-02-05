import { Loader2, RotateCcw, Zap } from 'lucide-react';
import { Avatar, AvatarFallback, Button } from '@/components/ui';
import type { SparkEvent } from '../sparks-hooks';

interface EventRowProps {
  event: SparkEvent;
  resending: boolean;
  onResend: () => void;
  formatTime: (ts: number) => string;
  t: (key: string) => string;
}

export function EventRow({ event: e, resending, onResend, formatTime, t }: EventRowProps) {
  return (
    <div className="group px-4 py-3.5 transition-colors hover:bg-muted/30">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-9 bg-amber-500/10 shadow-sm">
            <AvatarFallback className="bg-amber-500/10 text-amber-500">
              <Zap className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-mono font-semibold text-sm leading-tight">{e.type}</div>
            <div className="mt-0.5 text-muted-foreground text-xs">
              {t('sparks:from')} <span className="font-medium">{e.source}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onResend}
            disabled={resending}
            title={t('sparks:actions.resend')}
          >
            {resending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
          </Button>
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {formatTime(e.ts)}
          </span>
        </div>
      </div>
      {e.payload != null && (
        <pre className="mt-2.5 ml-12 max-h-24 overflow-auto rounded-md border border-border/50 bg-muted/50 p-2.5 font-mono text-muted-foreground text-xs leading-relaxed">
          {JSON.stringify(e.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
