import uFuzzy from '@leeoniya/ufuzzy';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LayoutDashboard, Search, SearchX, X } from 'lucide-react';
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Input, Label } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

const COLS = 9;
const CELL_SIZE = 36; // size-9
const GAP = 4; // gap-1
const ROW_HEIGHT = CELL_SIZE + GAP;
const CONTAINER_HEIGHT = 208; // h-52

let haystack: string[] | null = null;
let fuzzy: uFuzzy | null = null;

async function ensureIndex() {
  if (haystack) return;
  const { default: iconTags } = await import('lucide-static/tags.json');
  const tags = iconTags as Record<string, string[]>;
  haystack = iconNames.map((name) => {
    const t = tags[name];
    return t ? `${name} ${t.join(' ')}` : name;
  });
  fuzzy = new uFuzzy({ intraMode: 1 });
}

interface IconPickerGridProps {
  value: string;
  onChange: (icon: string) => void;
}

export default function IconPickerGrid({ value, onChange }: Readonly<IconPickerGridProps>) {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const [indexed, setIndexed] = useState(haystack !== null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (indexed) return;
    ensureIndex().then(() => setIndexed(true));
  }, [indexed]);

  const deferredSearch = useDeferredValue(search);

  const filteredIcons = useMemo(() => {
    if (!haystack || !fuzzy) return iconNames;

    const query = deferredSearch.trim();
    if (!query) return iconNames;

    const [idxs, info, order] = fuzzy.search(haystack, query);
    if (!idxs || !info || !order) return [];

    return order.map((i) => iconNames[info.idx[i]]) as IconName[];
  }, [deferredSearch, indexed]);

  // +1 for the default icon in the first row
  const totalItems = filteredIcons.length + 1;
  const rowCount = Math.ceil(totalItems / COLS);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  const isSearching = search.trim().length > 0;

  const clearSearch = () => {
    setSearch('');
    searchRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('boards:dashboard.icon')}
        </Label>
        {isSearching && (
          <Badge variant="secondary" className="font-mono tabular-nums">
            {filteredIcons.length}
          </Badge>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('boards:dashboard.iconHint')}
          className="h-9 pl-8 pr-8 text-sm"
        />
        {isSearching && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute top-2.5 right-2.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {filteredIcons.length === 0 && isSearching ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-md border text-muted-foreground"
          style={{ height: CONTAINER_HEIGHT }}
        >
          <SearchX className="size-8 opacity-50" />
          <p className="text-sm">{t('common:messages.noResults')}</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-y-auto rounded-md border"
          style={{ height: CONTAINER_HEIGHT }}
        >
          <div
            className="relative p-2"
            style={{ height: virtualizer.getTotalSize() + GAP }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const startIdx = virtualRow.index * COLS;
              return (
                <div
                  key={virtualRow.index}
                  className="absolute left-0 grid w-full grid-cols-9 gap-1 px-2"
                  style={{ top: virtualRow.start + 8, height: CELL_SIZE }}
                >
                  {Array.from({ length: COLS }, (_, col) => {
                    const itemIdx = startIdx + col;
                    if (itemIdx >= totalItems) return null;

                    // First item is always the default icon
                    if (itemIdx === 0) {
                      return (
                        <button
                          key="default"
                          type="button"
                          title={t('common:labels.default')}
                          onClick={() => onChange('')}
                          className={cn(
                            'flex size-9 items-center justify-center rounded-md transition-colors hover:bg-accent',
                            !value && 'bg-primary/10 ring-2 ring-inset ring-primary'
                          )}
                        >
                          <LayoutDashboard className="size-4 text-muted-foreground" />
                        </button>
                      );
                    }

                    const iconName = filteredIcons[itemIdx - 1];
                    return (
                      <button
                        key={iconName}
                        type="button"
                        title={iconName}
                        onClick={() => onChange(iconName)}
                        className={cn(
                          'flex size-9 items-center justify-center rounded-md transition-colors hover:bg-accent',
                          value === iconName && 'bg-primary/10 ring-2 ring-inset ring-primary'
                        )}
                      >
                        <DynamicIcon name={iconName} className="size-4" fallback={() => null} />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
