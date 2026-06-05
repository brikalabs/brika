import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@brika/clay';
import { useLocale } from '@/lib/use-locale';
import { useEventBreakdown } from '../hooks';
import { SOURCE_STYLE, SourceBadge } from './event-ui';

export function SourceBreakdown() {
  const { t } = useLocale();
  const { data, isLoading, isError } = useEventBreakdown();
  const sources = data?.sources ?? [];
  const total = sources.reduce((sum, s) => sum + s.count, 0) || 1;

  let body: React.ReactNode;
  if (isLoading) {
    body = [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />);
  } else if (isError) {
    body = <p className="text-muted-foreground text-sm">{t('analytics:loadError')}</p>;
  } else if (sources.length === 0) {
    body = <p className="text-muted-foreground text-sm">{t('analytics:empty')}</p>;
  } else {
    body = (
      <ul className="space-y-3">
        {sources.map((s) => {
          const pct = Math.round((s.count / total) * 100);
          return (
            <li key={s.source} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <SourceBadge source={s.source} />
                <span className="text-muted-foreground tabular-nums">
                  {s.count.toLocaleString()}
                  <span className="ml-1.5 text-muted-foreground/60">({pct}%)</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${SOURCE_STYLE[s.source].dot}`}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics:breakdown.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('analytics:breakdown.subtitle')}</p>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
