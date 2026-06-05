import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@brika/clay';
import type { Plugin } from '@brika/plugin';
import { Filter, Plug, Search, X } from 'lucide-react';
import { useCapture } from '@/features/analytics/hooks';
import { useLocale } from '@/lib/use-locale';
import { pluginsApi } from '../../plugins/api';

interface BlocksFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  pluginFilter: string;
  onPluginFilterChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  pluginIds: string[];
  categories: string[];
  hasActiveFilters: boolean;
  onClear: () => void;
  getPlugin: (id: string) => Plugin | undefined;
}

export function BlocksFilters({
  search,
  onSearchChange,
  pluginFilter,
  onPluginFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  pluginIds,
  categories,
  hasActiveFilters,
  onClear,
  getPlugin,
}: Readonly<BlocksFiltersProps>) {
  const { t, tp } = useLocale();
  const capture = useCapture();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <InputGroup className="flex-1 sm:max-w-sm">
        <InputGroupAddon>
          <Search className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder={t('blocks:search')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {search && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              variant="ghost"
              size="icon-xs"
              aria-label={t('common:actions.clear')}
              onClick={() => onSearchChange('')}
            >
              <X className="size-3.5" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="flex flex-wrap gap-2">
        <Select
          value={pluginFilter}
          onOpenChange={(open) => {
            if (open) {
              capture('blocks.filter_opened', { filter: 'plugin', optionCount: pluginIds.length });
            }
          }}
          onValueChange={(value) => {
            capture('blocks.filter_changed', { filter: 'plugin', cleared: value === 'all' });
            onPluginFilterChange(value);
          }}
        >
          <SelectTrigger className="w-52">
            <Plug className="mr-2 size-4 text-muted-foreground" />
            <SelectValue placeholder={t('blocks:filters.plugin')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('blocks:filters.allPlugins')}</SelectItem>
            {pluginIds.map((id) => {
              const plugin = getPlugin(id);
              return (
                <SelectItem key={id} value={id}>
                  <span className="flex items-center gap-2">
                    <Avatar className="size-5">
                      {plugin && <AvatarImage src={pluginsApi.getIconUrl(plugin.uid)} />}
                      <AvatarFallback className="bg-primary/10 text-[8px]">
                        <Plug className="size-3" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">
                      {tp(id, 'name', plugin?.displayName ?? plugin?.name ?? id)}
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Select
          value={categoryFilter}
          onOpenChange={(open) => {
            if (open) {
              capture('blocks.filter_opened', {
                filter: 'category',
                optionCount: categories.length,
              });
            }
          }}
          onValueChange={(value) => {
            capture('blocks.filter_changed', { filter: 'category', cleared: value === 'all' });
            onCategoryFilterChange(value);
          }}
        >
          <SelectTrigger className="w-40">
            <Filter className="mr-2 size-4 text-muted-foreground" />
            <SelectValue placeholder={t('blocks:filters.category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('blocks:filters.allCategories')}</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat} className="capitalize">
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              capture('blocks.filters_cleared');
              onClear();
            }}
            className="gap-1.5"
          >
            <X className="size-4" />
            {t('common:actions.clearFilters')}
          </Button>
        )}
      </div>
    </div>
  );
}
