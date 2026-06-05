import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@brika/clay';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';
import { useCaptureEvents } from '../hooks';
import { EventName, PropsRow, SourceBadge } from './event-ui';

export function RecentEvents() {
  const { t } = useLocale();
  const { data, isLoading, isError } = useCaptureEvents({ limit: 30, order: 'desc' });
  const events = data?.events ?? [];

  let body: React.ReactNode;
  if (isLoading) {
    body = [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />);
  } else if (isError) {
    body = <p className="text-muted-foreground text-sm">{t('analytics:loadError')}</p>;
  } else if (events.length === 0) {
    body = <p className="text-muted-foreground text-sm">{t('analytics:empty')}</p>;
  } else {
    body = events.map((e) => (
      <div
        key={e.id}
        className="flex flex-col gap-1 border-border/50 border-b py-1.5 text-sm last:border-0"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <SourceBadge source={e.source} />
            <EventName name={e.name} />
            {e.pluginName && (
              <span className="truncate font-mono text-muted-foreground text-xs">
                {e.pluginName}
              </span>
            )}
          </div>
          <time className="shrink-0 text-muted-foreground text-xs">
            {new Date(e.ts).toLocaleTimeString()}
          </time>
        </div>
        {e.props && <PropsRow props={e.props} max={3} />}
      </div>
    ));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{t('analytics:recent.title')}</CardTitle>
            <p className="text-muted-foreground text-sm">{t('analytics:recent.subtitle')}</p>
          </div>
          <Link
            to={paths.analytics.tab.to({ tab: 'events' })}
            className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
          >
            {t('analytics:recent.viewAll')}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">{body}</CardContent>
    </Card>
  );
}
