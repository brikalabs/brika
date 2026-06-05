import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@brika/clay';
import { Puzzle } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { useEventBreakdown } from '../hooks';

export function TopPlugins() {
  const { t } = useLocale();
  const { data, isLoading, isError } = useEventBreakdown();
  const plugins = data?.plugins ?? [];
  const max = plugins.reduce((m, p) => Math.max(m, p.count), 0) || 1;

  let body: React.ReactNode;
  if (isLoading) {
    body = [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-full" />);
  } else if (isError) {
    body = <p className="text-muted-foreground text-sm">{t('analytics:loadError')}</p>;
  } else if (plugins.length === 0) {
    body = <p className="text-muted-foreground text-sm">{t('analytics:topPlugins.empty')}</p>;
  } else {
    body = (
      <ul className="space-y-3">
        {plugins.slice(0, 8).map((p) => (
          <li key={p.pluginName} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Puzzle className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{p.pluginName}</span>
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {p.count.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-violet-500/80"
                style={{ width: `${Math.max(2, (p.count / max) * 100)}%` }}
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
        <CardTitle>{t('analytics:topPlugins.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('analytics:topPlugins.subtitle')}</p>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
