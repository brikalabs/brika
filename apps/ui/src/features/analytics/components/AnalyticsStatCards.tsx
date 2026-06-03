import { Badge, Card, CardContent, Skeleton } from '@brika/clay';
import { useLocale } from '@/lib/use-locale';
import { useEventStats } from '../hooks';

interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

function Stat({ label, value, hint }: Readonly<StatProps>) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-muted-foreground text-sm">{label}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-semibold text-2xl tracking-tight">{value}</span>
          {hint}
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsStatCards() {
  const { t } = useLocale();
  const { data, isLoading } = useEventStats();

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
      <Stat label={t('analytics:stats.total')} value={data.total.toLocaleString()} />
      <Stat label={t('analytics:stats.recent')} value={data.ringBufferSize.toLocaleString()} />
      <Stat label={t('analytics:stats.sources')} value={data.sources.length} />
      <Stat
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
