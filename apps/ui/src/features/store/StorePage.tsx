import { Package } from 'lucide-react';
import React from 'react';
import { useDataView } from '@/components/DataView';
import { Card, CardContent } from '@/components/ui';
import { useDebouncedState } from '@/hooks/use-debounce';
import { useLocale } from '@/lib/use-locale';
import type { FilterValue, SortValue } from './components';
import { PluginStoreCard, PluginStoreCardSkeleton, PluginStoreFilters } from './components';
import { useStorePlugins, useVerifiedPlugins } from './hooks';
import type { PluginSearchResult, StorePlugin } from './types';

export function StorePage() {
  const { t, tp } = useLocale();
  const [debouncedSearch, setSearch] = useDebouncedState('', 300);
  const [filter, setFilter] = React.useState<FilterValue>('all');
  const [sort, setSort] = React.useState<SortValue>('downloads');

  const { data: searchData, isLoading } = useStorePlugins({
    q: debouncedSearch,
    limit: 50,
  });
  const { data: verifiedData } = useVerifiedPlugins();

  // Map PluginSearchResult → StorePlugin, adding verified metadata from the verified list
  const allPlugins = React.useMemo(() => {
    const toStorePlugin = (plugin: PluginSearchResult): StorePlugin => {
      const verifiedPlugin = verifiedData?.plugins.find((p) => p.name === plugin.package.name);
      return {
        name: plugin.package.name,
        displayName: plugin.package.displayName,
        version: plugin.package.version,
        installVersion: plugin.installVersion,
        description: plugin.package.description ?? '',
        author: plugin.package.author || '',
        keywords: plugin.package.keywords || [],
        repository: plugin.package.repository,
        homepage: plugin.package.homepage,
        license: plugin.package.license,
        engines: plugin.package.engines,
        verified: !!verifiedPlugin,
        verifiedAt: verifiedPlugin?.verifiedAt,
        featured: verifiedPlugin?.featured || false,
        compatible: plugin.compatible,
        compatibilityReason: plugin.compatibilityReason,
        installed: plugin.installed,
        installedVersion: plugin.installedVersion,
        source: plugin.source,
        npm: {
          downloads: plugin.downloadCount,
          publishedAt: plugin.package.date || '',
        },
      };
    };

    return (searchData?.plugins ?? []).map(toStorePlugin);
  }, [searchData, verifiedData]);

  // Apply filters
  const filteredPlugins = React.useMemo(() => {
    let filtered = allPlugins;

    switch (filter) {
      case 'verified':
        filtered = filtered.filter((p) => p.verified);
        break;
      case 'compatible':
        filtered = filtered.filter((p) => p.compatible);
        break;
      case 'installed':
        filtered = filtered.filter((p) => p.installed);
        break;
    }

    switch (sort) {
      case 'downloads':
        filtered = [...filtered].sort((a, b) => b.npm.downloads - a.npm.downloads);
        break;
      case 'recent':
        filtered = [...filtered].sort(
          (a, b) => new Date(b.npm.publishedAt).getTime() - new Date(a.npm.publishedAt).getTime()
        );
        break;
      case 'name':
        filtered = [...filtered].sort((a, b) =>
          tp(a.name, 'name', a.displayName ?? a.name).localeCompare(
            tp(b.name, 'name', b.displayName ?? b.name)
          )
        );
        break;
    }

    return filtered;
  }, [allPlugins, filter, sort, tp]);

  // Featured plugins first
  const sortedPlugins = React.useMemo(
    () =>
      [...filteredPlugins].sort((a, b) => {
        if (a.featured && !b.featured) {
          return -1;
        }
        if (!a.featured && b.featured) {
          return 1;
        }
        return 0;
      }),
    [filteredPlugins]
  );

  const View = useDataView({
    data: sortedPlugins,
    isLoading,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t('store:title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('store:description')}</p>
      </div>

      <PluginStoreFilters
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
      />

      <View.Root>
        <View.Skeleton>
          <section>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({
                length: 6,
              }).map((_, i) => (
                <PluginStoreCardSkeleton key={`store-skeleton-${i}`} />
              ))}
            </div>
          </section>
        </View.Skeleton>

        <View.Empty>
          <Card>
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/50">
                <Package className="size-8 text-muted-foreground opacity-50" />
              </div>
              <h3 className="font-semibold text-lg">{t('store:noResults')}</h3>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('store:noResultsDescription')}
              </p>
            </CardContent>
          </Card>
        </View.Empty>

        <View.Content>
          {(plugins) => (
            <section>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {plugins.map((plugin) => (
                  <PluginStoreCard key={`${plugin.source}:${plugin.name}`} plugin={plugin} />
                ))}
              </div>
            </section>
          )}
        </View.Content>
      </View.Root>
    </div>
  );
}
