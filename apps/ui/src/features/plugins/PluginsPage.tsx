import { Plug } from 'lucide-react';
import { useDataView } from '@/components/DataView';
import { Card, CardContent } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { PluginCard, PluginCardSkeleton, PluginsPageHeader } from './components';
import { usePluginMutations, usePlugins } from './hooks';

export function PluginsPage() {
  const { t } = useLocale();
  const { data: plugins, isLoading, refetch } = usePlugins();
  const { disable, reload, kill } = usePluginMutations();

  const isBusy = disable.isPending || reload.isPending || kill.isPending;

  const View = useDataView({ data: plugins, isLoading });

  return (
    <div className="space-y-6">
      <PluginsPageHeader isLoading={isLoading} onRefresh={() => refetch()} />

      <View.Root>
        <View.Skeleton>
          <div className="grid gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <PluginCardSkeleton key={`plugin-skeleton-${i}`} />
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
          {(loadedPlugins) => (
            <div className="grid gap-4">
              {loadedPlugins.map((p) => (
                <PluginCard
                  key={p.uid}
                  plugin={p}
                  isBusy={isBusy}
                  onReload={(uid) => reload.mutate(uid)}
                  onDisable={(uid) => disable.mutate(uid)}
                  onKill={(uid) => kill.mutate(uid)}
                />
              ))}
            </div>
          )}
        </View.Content>
      </View.Root>
    </div>
  );
}
