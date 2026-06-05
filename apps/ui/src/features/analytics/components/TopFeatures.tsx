import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@brika/clay';
import { useLocale } from '@/lib/use-locale';
import { useTopEventNames } from '../hooks';
import { EventName } from './event-ui';

export function TopFeatures() {
  const { t } = useLocale();
  const { data, isLoading, isError } = useTopEventNames();
  const names = data?.names ?? [];
  const max = names.reduce((m, n) => Math.max(m, n.count), 0) || 1;

  let body: React.ReactNode;
  if (isLoading) {
    body = [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-full" />);
  } else if (isError) {
    body = <p className="text-muted-foreground text-sm">{t('analytics:loadError')}</p>;
  } else if (names.length === 0) {
    body = <p className="text-muted-foreground text-sm">{t('analytics:empty')}</p>;
  } else {
    body = (
      <ul className="space-y-3">
        {names.slice(0, 8).map((n, i) => (
          <li key={n.name} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-4 shrink-0 text-muted-foreground/50 text-xs tabular-nums">
                  {i + 1}
                </span>
                <EventName name={n.name} />
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {n.count.toLocaleString()}
              </span>
            </div>
            <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/80 transition-[width] duration-500"
                style={{ width: `${Math.max(2, (n.count / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics:topFeatures.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('analytics:topFeatures.subtitle')}</p>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
