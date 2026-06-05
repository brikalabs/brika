import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@brika/clay';
import { Chart } from '@brika/clay/components/chart';
import { useMemo } from 'react';
import { useLocale } from '@/lib/use-locale';
import { useEventTimeSeries } from '../hooks';

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_DAYS = 7;

/**
 * Round `now` down to the start of the current hour so the rolling 7-day
 * window advances on hour boundaries (instead of being frozen at component
 * mount, which made the chart drift past midnight) while keeping the
 * react-query key stable enough not to refetch on every render.
 */
function rollingStartTs(now: number): number {
  return Math.floor(now / HOUR_MS) * HOUR_MS - WINDOW_DAYS * 24 * HOUR_MS;
}

export function ActivityChart() {
  const { t } = useLocale();
  const startTs = rollingStartTs(Date.now());
  const { data, isLoading, isError } = useEventTimeSeries({ bucketMs: HOUR_MS, startTs });

  const points = useMemo(
    () => (data?.buckets ?? []).map((b) => ({ ts: b.bucket, value: b.count })),
    [data]
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = <Skeleton className="h-64 w-full" />;
  } else if (isError) {
    body = <p className="text-muted-foreground text-sm">{t('analytics:loadError')}</p>;
  } else {
    body = (
      <Chart
        data={points}
        showAxes
        className="h-64"
        yLabel={t('analytics:activity.axisCount')}
        formatValue={(v) => String(Math.round(v))}
        formatX={(ts) =>
          new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics:activity.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('analytics:activity.subtitle')}</p>
      </CardHeader>
      <CardContent>
        <figure>
          <figcaption className="sr-only">
            {t('analytics:activity.title')}: {t('analytics:activity.subtitle')}
          </figcaption>
          {body}
        </figure>
      </CardContent>
    </Card>
  );
}
