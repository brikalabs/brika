import type { Plugin } from '@brika/shared';
import { Filter, Plug, Search, X } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-sm">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('blocks:search')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={pluginFilter} onValueChange={onPluginFilterChange}>
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

        <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
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
          <Button variant="ghost" size="sm" onClick={onClear} className="gap-1.5">
            <X className="size-4" />
            {t('common:actions.clearFilters')}
          </Button>
        )}
      </div>
    </div>
  );
}
