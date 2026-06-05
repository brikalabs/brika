import {
  Button,
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@brika/clay';
import {
  ArrowDownUp,
  CalendarClock,
  Inbox,
  ListFilter,
  Puzzle,
  Search,
  SearchX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import { useEventStats, useInfiniteCaptureEvents, useTopEventNames } from '../hooks';
import type { CaptureSource, EventNameCount, EventQueryParams, StoredCaptureEvent } from '../types';
import { EventDetailSheet } from './EventDetailSheet';
import { EventName, PropsRow, SOURCE_STYLE, SourceBadge } from './event-ui';

const SOURCES: readonly CaptureSource[] = ['ui', 'plugin', 'hub', 'cli'];
const PAGE_SIZE = 100;
/** Sentinel for the "all" option, Radix Select forbids an empty item value. */
const ALL = '__all__';

type RangePreset = '1h' | '24h' | '7d' | '30d' | 'all';
const RANGE_MS: Record<Exclude<RangePreset, 'all'>, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function AllEventsExplorer() {
  const { t } = useLocale();

  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [name, setName] = useState('');
  const [pluginName, setPluginName] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [range, setRange] = useState<RangePreset>('24h');
  const [selected, setSelected] = useState<StoredCaptureEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Anchor the range window when the preset changes (good enough for browsing;
  // recomputing every render would thrash the query key).
  const startTs = useMemo(
    () => (range === 'all' ? undefined : Date.now() - RANGE_MS[range]),
    [range]
  );

  const params = useMemo<EventQueryParams>(
    () => ({
      source: sources.length > 0 ? sources : undefined,
      name: name || undefined,
      pluginName: pluginName || undefined,
      search: debouncedSearch || undefined,
      startTs,
      order,
      limit: PAGE_SIZE,
    }),
    [sources, name, pluginName, debouncedSearch, startTs, order]
  );

  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteCaptureEvents(params);
  const { data: names } = useTopEventNames();
  const { data: stats } = useEventStats();

  const events = useMemo(() => data?.pages.flatMap((p) => p.events) ?? [], [data]);
  const plugins = stats?.plugins ?? [];

  // Group event names by category (the dotted namespace prefix, e.g. "board"
  // for "board.created") and sort categories alphabetically for the filter.
  const eventGroups = useMemo(() => {
    const byCategory = new Map<string, EventNameCount[]>();
    for (const n of names?.names ?? []) {
      const dot = n.name.indexOf('.');
      const category = dot === -1 ? 'other' : n.name.slice(0, dot);
      const list = byCategory.get(category) ?? [];
      list.push(n);
      byCategory.set(category, list);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [names]);
  const hasFilters =
    sources.length > 0 ||
    name !== '' ||
    pluginName !== '' ||
    debouncedSearch !== '' ||
    range !== '24h';

  const toggleSource = (s: CaptureSource) =>
    setSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const clearFilters = () => {
    setSources([]);
    setName('');
    setPluginName('');
    setSearch('');
    setRange('24h');
  };

  const openDetail = (event: StoredCaptureEvent) => {
    setSelected(event);
    setDetailOpen(true);
  };

  const onRangeChange = (value: string) => {
    if (value === '1h' || value === '24h' || value === '7d' || value === '30d' || value === 'all') {
      setRange(value);
    }
  };

  const emptyIsFiltered = hasFilters && !isError;
  let emptyTitle = t('analytics:empty');
  if (isError) {
    emptyTitle = t('analytics:loadError');
  } else if (hasFilters) {
    emptyTitle = t('analytics:explorer.noMatch');
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Filter bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <InputGroup className="w-[220px]">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('analytics:explorer.searchPlaceholder')}
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                variant="ghost"
                size="icon-xs"
                aria-label={t('analytics:explorer.clearSearch')}
                onClick={() => setSearch('')}
              >
                <X className="size-3.5" />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <div className="flex items-center gap-1">
          {SOURCES.map((s) => {
            const active = sources.includes(s);
            return (
              <Button
                key={s}
                type="button"
                variant={active ? 'secondary' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => toggleSource(s)}
              >
                <span
                  className={`size-1.5 rounded-full ${SOURCE_STYLE[s].dot}`}
                  aria-hidden="true"
                />
                {s}
              </Button>
            );
          })}
        </div>

        <Select value={name || ALL} onValueChange={(v) => setName(v === ALL ? '' : v)}>
          <SelectTrigger className="w-52">
            <span className="flex min-w-0 items-center gap-2 overflow-hidden">
              <ListFilter className="size-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder={t('analytics:explorer.allEvents')} />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('analytics:explorer.allEvents')}</SelectItem>
            {eventGroups.map(([category, items]) => (
              <SelectGroup key={category}>
                <SelectLabel className="capitalize">{category}</SelectLabel>
                {items.map((n) => (
                  <SelectItem key={n.name} value={n.name}>
                    {n.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        {plugins.length > 0 && (
          <Select
            value={pluginName || ALL}
            onValueChange={(v) => setPluginName(v === ALL ? '' : v)}
          >
            <SelectTrigger className="w-48">
              <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                <Puzzle className="size-4 shrink-0 text-muted-foreground" />
                <SelectValue placeholder={t('analytics:explorer.allPlugins')} />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('analytics:explorer.allPlugins')}</SelectItem>
              {plugins.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={range} onValueChange={onRangeChange}>
          <SelectTrigger className="w-48">
            <span className="flex min-w-0 items-center gap-2 overflow-hidden">
              <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">{t('analytics:explorer.range.1h')}</SelectItem>
            <SelectItem value="24h">{t('analytics:explorer.range.24h')}</SelectItem>
            <SelectItem value="7d">{t('analytics:explorer.range.7d')}</SelectItem>
            <SelectItem value="30d">{t('analytics:explorer.range.30d')}</SelectItem>
            <SelectItem value="all">{t('analytics:explorer.range.all')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={order} onValueChange={(v) => setOrder(v === 'asc' ? 'asc' : 'desc')}>
          <SelectTrigger className="ml-auto w-52">
            <span className="flex min-w-0 items-center gap-2 overflow-hidden">
              <ArrowDownUp className="size-4 shrink-0 text-muted-foreground" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">{t('analytics:explorer.order.newest')}</SelectItem>
            <SelectItem value="asc">{t('analytics:explorer.order.oldest')}</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            {t('analytics:explorer.clearFilters')}
          </Button>
        )}
      </div>

      {/* Results */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60">
        <div className="min-h-0 flex-1 overflow-auto">
          {/* Column header. The grid template is repeated verbatim on every row
              below so header and data columns are always pixel-aligned. */}
          <div className="sticky top-0 z-10 grid grid-cols-[7rem_5rem_1fr_9rem_1.4fr] items-center gap-3 border-border/50 border-b bg-background/95 px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide backdrop-blur">
            <div>{t('analytics:explorer.colTime')}</div>
            <div>{t('analytics:explorer.colSource')}</div>
            <div>{t('analytics:explorer.colEvent')}</div>
            <div>{t('analytics:explorer.colPlugin')}</div>
            <div>{t('analytics:explorer.colProps')}</div>
          </div>

          {isLoading
            ? ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((id) => (
                <div
                  key={id}
                  className="grid grid-cols-[7rem_5rem_1fr_9rem_1.4fr] items-center gap-3 border-border/50 border-b px-4 py-2.5"
                >
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))
            : events.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => openDetail(e)}
                  className={`relative grid w-full grid-cols-[7rem_5rem_1fr_9rem_1.4fr] items-center gap-3 border-border/50 border-b px-4 py-2.5 text-left transition-colors before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:content-[''] hover:bg-muted/50 ${SOURCE_STYLE[e.source].rail}`}
                >
                  <time
                    className="text-muted-foreground text-xs tabular-nums"
                    dateTime={new Date(e.ts).toISOString()}
                    title={new Date(e.ts).toLocaleString()}
                  >
                    {new Date(e.ts).toLocaleTimeString()}
                  </time>
                  <div>
                    <SourceBadge source={e.source} />
                  </div>
                  <div className="min-w-0 truncate">
                    <EventName name={e.name} />
                  </div>
                  <div className="min-w-0 truncate font-mono text-muted-foreground text-xs">
                    {e.pluginName ?? <span className="opacity-40">-</span>}
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    {e.props ? <PropsRow props={e.props} /> : null}
                  </div>
                </button>
              ))}

          {!isLoading && events.length === 0 && (
            <EmptyState className="py-16">
              <EmptyStateIcon>
                {hasFilters || isError ? (
                  <SearchX className="size-8" />
                ) : (
                  <Inbox className="size-8" />
                )}
              </EmptyStateIcon>
              <EmptyStateTitle>{emptyTitle}</EmptyStateTitle>
              {emptyIsFiltered && (
                <EmptyStateDescription>{t('analytics:explorer.noMatchHint')}</EmptyStateDescription>
              )}
            </EmptyState>
          )}
        </div>

        {!isLoading && events.length > 0 && (
          <div className="flex items-center justify-between border-border/50 border-t px-4 py-2.5">
            <span className="text-muted-foreground text-xs tabular-nums">
              {t('analytics:explorer.showing', { count: events.length })}
            </span>
            {hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage
                  ? t('analytics:explorer.loading')
                  : t('analytics:explorer.loadMore')}
              </Button>
            ) : (
              <span className="text-muted-foreground/60 text-xs">
                {t('analytics:explorer.end')}
              </span>
            )}
          </div>
        )}
      </div>

      <EventDetailSheet event={selected} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
