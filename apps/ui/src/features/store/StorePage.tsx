import type { StorePlugin } from '@brika/shared';
import { Package } from 'lucide-react';
import React from 'react';
import { useDataView } from '@/components/DataView';
import { Card, CardContent } from '@/components/ui';
import { useDebouncedState } from '@/hooks/use-debounce';
import { useLocale } from '@/lib/use-locale';
import type { FilterValue, SortValue } from './components';
import { PluginStoreCard, PluginStoreCardSkeleton, PluginStoreFilters } from './components';
import { useLocalPlugins, useStorePlugins, useVerifiedPlugins } from './hooks';

export function StorePage() {
  const { t, tp } = useLocale();
  const [debouncedSearch, setSearch] = useDebouncedState('', 300);
  const [filter, setFilter] = React.useState<FilterValue>('all');
  const [sort, setSort] = React.useState<SortValue>('downloads');

  // Fetch plugins (debounced to avoid excessive API calls)
  const { data: searchData, isLoading } = useStorePlugins({
    q: debouncedSearch,
    limit: 50,
  });

  const { data: verifiedData } = useVerifiedPlugins();
  const { data: localData } = useLocalPlugins({ q: debouncedSearch });

  // Merge npm + local results with verified status and compatibility
  const allPlugins = React.useMemo(() => {
    const verifiedSet = new Set(verifiedData?.plugins.map((p) => p.name) || []);

    // Map npm results
    const npmPlugins: StorePlugin[] = (searchData?.plugins ?? []).map((npmPlugin) => {
      const verified = verifiedSet.has(npmPlugin.package.name);
      const verifiedPlugin = verifiedData?.plugins.find((p) => p.name === npmPlugin.package.name);

      return {
        name: npmPlugin.package.name,
        displayName: npmPlugin.package.displayName,
        version: npmPlugin.package.version,
        description: npmPlugin.package.description ?? '',
        author: npmPlugin.package.author || '',
        keywords: npmPlugin.package.keywords || [],
        repository: npmPlugin.package.repository,
        homepage: npmPlugin.package.homepage,
        license: npmPlugin.package.license,
        engines: npmPlugin.package.engines,
        verified,
        verifiedAt: verifiedPlugin?.verifiedAt,
        featured: verifiedPlugin?.featured || false,
        compatible: true,
        installed: npmPlugin.installed || false,
        installedVersion: npmPlugin.installedVersion,
        source: 'npm',
        npm: {
          downloads: npmPlugin.downloadCount || 0,
          publishedAt: npmPlugin.package.date || '',
        },
      } satisfies StorePlugin;
    });

    // Map local workspace results
    const localPlugins: StorePlugin[] = (localData?.plugins ?? []).map(
      (local) =>
        ({
          name: local.package.name,
          displayName: local.package.displayName,
          version: local.package.version,
          description: local.package.description ?? '',
          author: local.package.author || '',
          keywords: local.package.keywords || [],
          repository: local.package.repository,
          homepage: local.package.homepage,
          license: local.package.license,
          engines: local.package.engines,
          verified: false,
          featured: false,
          compatible: true,
          installed: local.installed || false,
          installedVersion: local.installedVersion,
          source: 'local',
          npm: { downloads: 0, publishedAt: '' },
        }) satisfies StorePlugin
    );

    // Deduplicate: local plugins take precedence over npm
    const localNames = new Set(localPlugins.map((p) => p.name));
    const deduped = npmPlugins.filter((p) => !localNames.has(p.name));

    return [...localPlugins, ...deduped];
  }, [searchData, verifiedData, localData]);

  // Apply filters
  const filteredPlugins = React.useMemo(() => {
    let filtered = allPlugins;

    // Apply filter
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

    // Apply sort
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

  // Sort plugins to show featured first
  const sortedPlugins = React.useMemo(
    () =>
      [...filteredPlugins].sort((a, b) => {
        // Featured plugins come first
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return 0;
      }),
    [filteredPlugins]
  );

  const View = useDataView({ data: sortedPlugins, isLoading });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t('store:title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('store:description')}</p>
      </div>

      {/* Search and Filters */}
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
              {Array.from({ length: 6 }).map((_, i) => (
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
                  <PluginStoreCard key={plugin.name} plugin={plugin} />
                ))}
              </div>
            </section>
          )}
        </View.Content>
      </View.Root>
    </div>
  );
}
