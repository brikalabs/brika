import type { Plugin } from '@brika/plugin';
import { AlertTriangle, Plug } from 'lucide-react';
import { useMemo } from 'react';
import { useDataView } from '@/components/DataView';
import { Card, CardContent } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { PluginCard, PluginCardSkeleton, PluginsPageHeader } from './components';
import { usePluginMutations, usePlugins, usePluginUpdates } from './hooks';

const UNHEALTHY_STATUSES = new Set([
  'crashed',
  'crash-loop',
  'degraded',
  'stopped',
  'incompatible',
]);

function isUnhealthy(p: Plugin) {
  return UNHEALTHY_STATUSES.has(p.status);
}

export function PluginsPage() {
  const { t } = useLocale();
  const { data: plugins, isLoading, refetch } = usePlugins();
  const { disable, reload, kill } = usePluginMutations();
  const { available: availableUpdates, getUpdate } = usePluginUpdates();

  const isBusy = disable.isPending || reload.isPending || kill.isPending;

  const { healthy, unhealthy } = useMemo(() => {
    if (!plugins) {
      return {
        healthy: [],
        unhealthy: [],
      };
    }
    const h: Plugin[] = [];
    const u: Plugin[] = [];
    for (const p of plugins) {
      if (isUnhealthy(p)) {
        u.push(p);
      } else {
        h.push(p);
      }
    }
    return {
      healthy: h,
      unhealthy: u,
    };
  }, [
    plugins,
  ]);

  const View = useDataView({
    data: plugins,
    isLoading,
  });

  const renderCard = (p: Plugin) => (
    <PluginCard
      key={p.uid}
      plugin={p}
      isBusy={isBusy}
      updateInfo={getUpdate(p.name)}
      onReload={(uid) => reload.mutate(uid)}
      onDisable={(uid) => disable.mutate(uid)}
      onKill={(uid) => kill.mutate(uid)}
    />
  );

  return (
    <div className="space-y-6">
      <PluginsPageHeader
        isLoading={isLoading}
        pluginCount={plugins?.length ?? 0}
        plugins={plugins ?? []}
        availableUpdates={availableUpdates}
        onRefresh={() => refetch()}
      />

      <View.Root>
        <View.Skeleton>
          <div className="grid gap-2">
            {Array.from({
              length: 4,
            }).map((_, i) => (
              <PluginCardSkeleton key={`skeleton-${i}`} />
            ))}
          </div>
        </View.Skeleton>

        <View.Empty>
          <Card>
            <CardContent className="py-12 text-center">
              <Plug className="mx-auto mb-4 size-12 text-muted-foreground" />
              <h3 className="font-semibold text-lg">{t('plugins:empty')}</h3>
              <p className="mt-1 text-muted-foreground">{t('plugins:emptyHint')}</p>
            </CardContent>
          </Card>
        </View.Empty>

        <View.Content>
          {() => (
            <div className="space-y-5">
              {unhealthy.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <AlertTriangle className="size-3.5 text-amber-500" />
                    <span className="font-medium uppercase tracking-wider">
                      {t('plugins:needsAttention', {
                        count: unhealthy.length,
                      })}
                    </span>
                  </div>
                  <div className="grid gap-2">{unhealthy.map(renderCard)}</div>
                </div>
              )}

              <div className="grid gap-2">{healthy.map(renderCard)}</div>
            </div>
          )}
        </View.Content>
      </View.Root>
    </div>
  );
}
