import { Badge, Card, CardContent, Skeleton } from '@brika/clay';
import { Activity, type LucideIcon, Radio, Share2, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { useLocale } from '@/lib/use-locale';
import { useEventStats, useEventTimeSeries } from '../hooks';
import type { CaptureSource } from '../types';
import { SOURCE_STYLE } from './event-ui';

const HOUR_MS = 60 * 60 * 1000;
const SOURCES: readonly CaptureSource[] = ['ui', 'plugin', 'hub', 'cli'];

interface KpiProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

function Kpi({ icon: Icon, label, value, hint }: Readonly<KpiProps>) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-5">
        <div className="min-w-0">
          <div className="text-muted-foreground text-sm">{label}</div>
          <div className="mt-1.5 font-semibold text-3xl tabular-nums tracking-tight">{value}</div>
          {hint && <div className="mt-2">{hint}</div>}
        </div>
        <div className="rounded-md bg-muted/60 p-2 text-muted-foreground">
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsStatCards() {
  const { t } = useLocale();
  const { data, isLoading } = useEventStats();

  // Anchor the 24h window to the current hour so the query key stays stable
  // between renders (advances on hour boundaries, not on every render).
  const startTs = useMemo(() => Math.floor(Date.now() / HOUR_MS) * HOUR_MS - 24 * HOUR_MS, []);
  const { data: series } = useEventTimeSeries({ bucketMs: HOUR_MS, startTs });
  const last24h = useMemo(
    () => (series?.buckets ?? []).reduce((sum, b) => sum + b.count, 0),
    [series]
  );

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Kpi icon={Activity} label={t('analytics:stats.total')} value={data.total.toLocaleString()} />
      <Kpi
        icon={TrendingUp}
        label={t('analytics:stats.last24h')}
        value={last24h.toLocaleString()}
      />
      <Kpi
        icon={Radio}
        label={t('analytics:stats.sources')}
        value={data.sources.length}
        hint={
          <div className="flex items-center gap-1.5">
            {SOURCES.map((s) => (
              <span
                key={s}
                title={s}
                className={`size-2 rounded-full ${
                  data.sources.includes(s) ? SOURCE_STYLE[s].dot : 'bg-muted-foreground/25'
                }`}
              />
            ))}
          </div>
        }
      />
      <Kpi
        icon={Share2}
        label={t('analytics:stats.forwarding')}
        value={
          <Badge variant={data.remoteForwarding ? 'default' : 'outline'}>
            {data.remoteForwarding
              ? (data.remoteForwardingProvider ?? t('analytics:stats.forwardingOn'))
              : t('analytics:stats.forwardingOff')}
          </Badge>
        }
      />
    </div>
  );
}
