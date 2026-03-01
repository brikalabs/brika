import { useMemo, useState } from 'react';
import { useDebouncedState } from '@/hooks/use-debounce';
import { useLocale } from '@/lib/use-locale';
import { usePlugins } from '../plugins/hooks';
import type { BlockDefinition } from '../workflows/api';
import { useBlockTypes } from '../workflows/hooks';

export function useBlocks() {
  const { data: blockTypes = [], isLoading } = useBlockTypes();
  const { data: plugins = [] } = usePlugins();

  const getPlugin = (pluginId: string) => plugins.find((p) => p.name === pluginId);

  return {
    blockTypes,
    plugins,
    isLoading,
    getPlugin,
  };
}

export function useBlocksFilters(blockTypes: BlockDefinition[]) {
  const { tp } = useLocale();
  const [search, setSearch] = useDebouncedState('', 200);
  const [pluginFilter, setPluginFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Get unique plugins and categories for filter options
  const { pluginIds, categories } = useMemo(() => {
    const pIds = new Set<string>();
    const cats = new Set<string>();
    for (const block of blockTypes) {
      pIds.add(block.pluginId);
      cats.add(block.category || 'other');
    }
    return {
      pluginIds: [...pIds],
      categories: [...cats].sort((a, b) => a.localeCompare(b)),
    };
  }, [blockTypes]);

  // Filter blocks
  const filteredBlocks = useMemo(() => {
    return blockTypes.filter((b) => {
      if (pluginFilter !== 'all' && b.pluginId !== pluginFilter) {
        return false;
      }
      if (categoryFilter !== 'all' && (b.category || 'other') !== categoryFilter) {
        return false;
      }
      if (!search) {
        return true;
      }

      const searchLower = search.toLowerCase();
      const blockKey = b.id.split(':').pop() || b.id;
      const blockName = tp(b.pluginId, `blocks.${blockKey}.name`, b.name || blockKey);
      const blockDesc = tp(b.pluginId, `blocks.${blockKey}.description`, b.description);

      return (
        blockName.toLowerCase().includes(searchLower) ||
        blockDesc?.toLowerCase().includes(searchLower) ||
        b.id.toLowerCase().includes(searchLower) ||
        b.pluginId.toLowerCase().includes(searchLower)
      );
    });
  }, [blockTypes, search, pluginFilter, categoryFilter, tp]);

  // Group by category
  const groupedBlocks = useMemo(() => {
    return filteredBlocks.reduce(
      (acc, block) => {
        const cat = block.category || 'other';
        acc[cat] ??= [];
        acc[cat].push(block);
        return acc;
      },
      {} as Record<string, BlockDefinition[]>
    );
  }, [filteredBlocks]);

  const hasActiveFilters = pluginFilter !== 'all' || categoryFilter !== 'all' || search !== '';

  const clearFilters = () => {
    setSearch('');
    setPluginFilter('all');
    setCategoryFilter('all');
  };

  return {
    search,
    setSearch,
    pluginFilter,
    setPluginFilter,
    categoryFilter,
    setCategoryFilter,
    pluginIds,
    categories,
    filteredBlocks,
    groupedBlocks,
    hasActiveFilters,
    clearFilters,
  };
}
