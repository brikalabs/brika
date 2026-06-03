import { Button } from '@brika/clay';
import { useQueryClient } from '@tanstack/react-query';
import { Info, RefreshCw } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { analyticsKeys } from './api';
import { ActivityChart } from './components/ActivityChart';
import { AnalyticsStatCards } from './components/AnalyticsStatCards';
import { RecentEvents } from './components/RecentEvents';
import { TopFeatures } from './components/TopFeatures';

export function AnalyticsPage() {
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const refresh = () => queryClient.invalidateQueries({ queryKey: analyticsKeys.all });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{t('analytics:title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('analytics:subtitle')}</p>
        </div>
        <Button variant="secondary" onClick={refresh} className="gap-2">
          <RefreshCw className="size-4" />
          {t('common:actions.refresh')}
        </Button>
      </div>

      <p className="flex items-center gap-2 text-muted-foreground text-xs">
        <Info className="size-3.5 shrink-0" />
        {t('analytics:anonymousNote')}
      </p>

      <AnalyticsStatCards />
      <ActivityChart />

      <div className="grid gap-4 lg:grid-cols-2">
        <TopFeatures />
        <RecentEvents />
      </div>
    </div>
  );
}
