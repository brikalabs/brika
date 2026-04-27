import { Input } from '@brika/clay/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@brika/clay/components/select';
import { Search } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';

const FILTER_VALUES = ['all', 'verified', 'compatible', 'installed'] as const;
const SORT_VALUES = ['downloads', 'recent', 'name'] as const;

export type FilterValue = (typeof FILTER_VALUES)[number];
export type SortValue = (typeof SORT_VALUES)[number];

function isFilterValue(value: string): value is FilterValue {
  return (FILTER_VALUES as readonly string[]).includes(value);
}

function isSortValue(value: string): value is SortValue {
  return (SORT_VALUES as readonly string[]).includes(value);
}

interface PluginStoreFiltersProps {
  onSearchChange: (value: string) => void;
  filter: FilterValue;
  onFilterChange: (value: FilterValue) => void;
  sort: SortValue;
  onSortChange: (value: SortValue) => void;
}

export function PluginStoreFilters({
  onSearchChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
}: Readonly<PluginStoreFiltersProps>) {
  const { t } = useLocale();

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('store:search.placeholder')}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter */}
      <Select
        value={filter}
        onValueChange={(value) => {
          if (isFilterValue(value)) {
            onFilterChange(value);
          }
        }}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Filter" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('store:filter.all')}</SelectItem>
          <SelectItem value="verified">{t('store:filter.verified')}</SelectItem>
          <SelectItem value="compatible">{t('store:filter.compatible')}</SelectItem>
          <SelectItem value="installed">{t('store:filter.installed')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort */}
      <Select
        value={sort}
        onValueChange={(value) => {
          if (isSortValue(value)) {
            onSortChange(value);
          }
        }}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="downloads">{t('store:sort.downloads')}</SelectItem>
          <SelectItem value="recent">{t('store:sort.recent')}</SelectItem>
          <SelectItem value="name">{t('store:sort.name')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
