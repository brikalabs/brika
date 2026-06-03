import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@brika/clay';
import { useLocale } from '@/lib/use-locale';
import { useCaptureEvents } from '../hooks';
import type { CaptureSource } from '../types';

const SOURCE_VARIANT: Record<CaptureSource, 'default' | 'secondary' | 'outline'> = {
  ui: 'default',
  plugin: 'secondary',
  hub: 'outline',
  cli: 'outline',
};

export function RecentEvents() {
  const { t } = useLocale();
  const { data, isLoading } = useCaptureEvents({ limit: 30, order: 'desc' });
  const events = data?.events ?? [];

  let body: React.ReactNode;
  if (isLoading) {
    body = [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />);
  } else if (events.length === 0) {
    body = <p className="text-muted-foreground text-sm">{t('analytics:empty')}</p>;
  } else {
    body = events.map((e) => (
      <div
        key={e.id}
        className="flex items-center justify-between gap-3 border-border/50 border-b py-1.5 text-sm last:border-0"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant={SOURCE_VARIANT[e.source]}>{e.source}</Badge>
          <span className="truncate font-medium">{e.name}</span>
          {e.pluginName && (
            <span className="truncate text-muted-foreground text-xs">{e.pluginName}</span>
          )}
        </div>
        <time className="shrink-0 text-muted-foreground text-xs">
          {new Date(e.ts).toLocaleTimeString()}
        </time>
      </div>
    ));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics:recent.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('analytics:recent.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-2">{body}</CardContent>
    </Card>
  );
}
