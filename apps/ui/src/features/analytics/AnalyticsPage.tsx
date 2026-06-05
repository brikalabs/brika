import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@brika/clay';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Info, RefreshCw } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';
import { analyticsKeys } from './api';
import { ActivityChart } from './components/ActivityChart';
import { AllEventsExplorer } from './components/AllEventsExplorer';
import { AnalyticsStatCards } from './components/AnalyticsStatCards';
import { SourceBreakdown } from './components/SourceBreakdown';
import { TopFeatures } from './components/TopFeatures';
import { TopPlugins } from './components/TopPlugins';
import { useCapture } from './hooks';

export function AnalyticsPage() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const capture = useCapture();

  const activeTab = params.tab === 'events' ? 'events' : 'overview';

  const refresh = () => {
    capture('analytics.refreshed');
    queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
  };

  const onTabChange = (value: string) => {
    capture('analytics.tab_switched', { tab: value });
    const to =
      value === 'events' ? paths.analytics.tab.to({ tab: 'events' }) : paths.analytics.list.to();
    navigate({ to });
  };

  return (
    <div className="flex h-full flex-col p-8">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-semibold text-2xl tracking-tight">{t('analytics:title')}</h1>
          <p className="mt-1 text-muted-foreground text-sm">{t('analytics:subtitle')}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground/80 text-xs">
            <Info className="size-3 shrink-0" />
            {t('analytics:anonymousNote')}
          </p>
        </div>
        <Button variant="secondary" onClick={refresh} className="shrink-0 gap-2">
          <RefreshCw className="size-4" />
          {t('common:actions.refresh')}
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="mt-5 flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="shrink-0">
          <TabsTrigger value="overview">{t('analytics:tabs.overview')}</TabsTrigger>
          <TabsTrigger value="events">{t('analytics:tabs.events')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 min-h-0 flex-1 space-y-4 overflow-auto pb-2">
          <AnalyticsStatCards />
          <ActivityChart />
          <div className="grid gap-4 lg:grid-cols-3">
            <SourceBreakdown />
            <TopFeatures />
            <TopPlugins />
          </div>
        </TabsContent>

        <TabsContent value="events" className="mt-5 flex min-h-0 flex-1 flex-col">
          <AllEventsExplorer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
