import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@brika/clay';
import { Chart } from '@brika/clay/components/chart';
import { useMemo } from 'react';
import { useLocale } from '@/lib/use-locale';
import { useEventTimeSeries } from '../hooks';

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_DAYS = 7;

export function ActivityChart() {
  const { t } = useLocale();
  const startTs = useMemo(() => Date.now() - WINDOW_DAYS * 24 * HOUR_MS, []);
  const { data, isLoading } = useEventTimeSeries({ bucketMs: HOUR_MS, startTs });

  const points = useMemo(
    () => (data?.buckets ?? []).map((b) => ({ ts: b.bucket, value: b.count })),
    [data]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics:activity.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('analytics:activity.subtitle')}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <Chart
            data={points}
            showAxes
            className="h-48"
            yLabel={t('analytics:activity.axisCount')}
            formatValue={(v) => String(Math.round(v))}
            formatX={(ts) =>
              new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
