import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/lib/use-locale';

export type FilterValue = 'all' | 'verified' | 'compatible' | 'installed';
export type SortValue = 'downloads' | 'recent' | 'name';

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
      <Select value={filter} onValueChange={onFilterChange}>
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
      <Select value={sort} onValueChange={onSortChange}>
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
