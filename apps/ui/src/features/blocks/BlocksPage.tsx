/**
 * Blocks Page
 *
 * Grid view of all available block types for building workflows.
 */

import { useDataView } from '@/components/DataView';
import { useLocale } from '@/lib/use-locale';
import { BlocksEmpty } from './components/BlocksEmpty';
import { BlocksFilters } from './components/BlocksFilters';
import { BlocksGrid } from './components/BlocksGrid';
import { BlocksSkeleton } from './components/BlocksSkeleton';
import { useBlocks, useBlocksFilters } from './hooks';

export function BlocksPage() {
  const { t } = useLocale();
  const { blockTypes, isLoading, getPlugin } = useBlocks();
  const filters = useBlocksFilters(blockTypes);

  const View = useDataView({
    data: filters.groupedBlocks,
    isLoading,
    isEmpty: (data) => Object.keys(data).length === 0,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t('blocks:title')}</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('blocks:subtitle')}
          {!isLoading && (
            <span className="ml-2 font-medium">
              · {filters.filteredBlocks.length}{' '}
              {filters.filteredBlocks.length === 1 ? 'block' : 'blocks'}
            </span>
          )}
        </p>
      </div>

      {/* Filters */}
      <BlocksFilters
        search={filters.search}
        onSearchChange={filters.setSearch}
        pluginFilter={filters.pluginFilter}
        onPluginFilterChange={filters.setPluginFilter}
        categoryFilter={filters.categoryFilter}
        onCategoryFilterChange={filters.setCategoryFilter}
        pluginIds={filters.pluginIds}
        categories={filters.categories}
        hasActiveFilters={filters.hasActiveFilters}
        onClear={filters.clearFilters}
        getPlugin={getPlugin}
      />

      {/* Content */}
      <View.Root>
        <View.Skeleton>
          <BlocksSkeleton />
        </View.Skeleton>
        <View.Empty>
          <BlocksEmpty hasSearch={!!filters.search} />
        </View.Empty>
        <View.Content>
          {(categories) => <BlocksGrid categories={categories} getPlugin={getPlugin} />}
        </View.Content>
      </View.Root>
    </div>
  );
}
