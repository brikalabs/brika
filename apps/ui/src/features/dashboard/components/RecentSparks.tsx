import {
  Avatar,
  AvatarFallback,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from '@brika/clay';
import { Zap } from 'lucide-react';
import type { useSparkStream } from '@/features/events';
import { useLocale } from '@/lib/use-locale';

type SparkEvent = ReturnType<typeof useSparkStream>['events'][number];

export interface RecentSparksProps {
  sparks: SparkEvent[];
}

export function RecentSparks({ sparks }: Readonly<RecentSparksProps>) {
  const { t, formatTime } = useLocale();

  return (
    <Card className="flex flex-col lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="size-5 text-primary" />
              {t('sparks:title')}
            </CardTitle>
            <CardDescription>{t('sparks:subtitle')}</CardDescription>
          </div>
          <Badge variant="secondary">{sparks.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="-mx-2 flex-1 px-2">
          <div className="flex flex-col gap-2">
            {sparks.slice(0, 8).map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-lg bg-muted/30 p-2.5 transition-colors hover:bg-muted/50"
              >
                <Avatar className="size-9 bg-primary/10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Zap className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium font-mono text-sm">{e.type}</div>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <span>{e.source}</span>
                    {typeof e.payload === 'object' &&
                      e.payload !== null &&
                      Object.keys(e.payload).length > 0 && (
                        <>
                          <span className="text-muted-foreground/50">•</span>
                          <span className="max-w-50 truncate">
                            {JSON.stringify(e.payload).slice(0, 50)}
                          </span>
                        </>
                      )}
                  </div>
                </div>
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  {formatTime(e.ts)}
                </span>
              </div>
            ))}
            {sparks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Zap className="mb-3 size-10 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">{t('sparks:emptyStream')}</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
