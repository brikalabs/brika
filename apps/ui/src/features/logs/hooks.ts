import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { getStreamUrl } from "@/lib/query";
import { type LogQueryParams, logsApi, logsKeys, type PluginInfo, type StoredLogEvent } from "./api";
import { type LogFilters, useLogsStore } from "./store";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert store filters to API query params */
function filtersToParams(filters: LogFilters): LogQueryParams {
  return {
    level: filters.levels.length > 0 ? filters.levels : undefined,
    source: filters.sources.length > 0 ? filters.sources : undefined,
    pluginName: filters.pluginName ?? undefined,
    search: filters.search || undefined,
    startTs: filters.startDate?.getTime(),
    endTs: filters.endDate?.getTime(),
    order: "desc",
    limit: 100,
  };
}

/** Check if a log matches the current filters (for client-side filtering) */
function matchesFilters(log: StoredLogEvent, filters: LogFilters): boolean {
  if (filters.levels.length > 0 && !filters.levels.includes(log.level)) { return false; }
  if (filters.sources.length > 0 && !filters.sources.includes(log.source)) { return false; }
  if (filters.pluginName && log.pluginName !== filters.pluginName) { return false; }
  if (filters.search && !log.message.toLowerCase().includes(filters.search.toLowerCase())) { return false; }
  // Date filters apply to historical, live logs are always recent
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Historical Query Hook
// ─────────────────────────────────────────────────────────────────────────────

function useHistoricalLogs() {
  const { filters } = useLogsStore();
  const params = useMemo(() => filtersToParams(filters), [filters]);

  return useInfiniteQuery({
    queryKey: logsKeys.query(params),
    queryFn: ({ pageParam }) => logsApi.query({ ...params, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as number | undefined,
    staleTime: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Stream Hook
// ─────────────────────────────────────────────────────────────────────────────

function useLiveStream() {
  const { addNew } = useLogsStore();
  const idCounter = useRef(Date.now()); // Generate temporary IDs for live logs

  useEffect(() => {
    const es = new EventSource(getStreamUrl("/api/stream/logs"));
    es.addEventListener("log", (ev: MessageEvent) => {
      const log = JSON.parse(ev.data);
      // Add a temporary ID for live logs (negative to avoid collision with DB IDs)
      idCounter.current -= 1;
      addNew({ ...log, id: idCounter.current });
    });
    es.onerror = () => { /* Connection error - auto-retry handled by EventSource */ };
    return () => es.close();
  }, [addNew]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useLogPlugins() {
  return useQuery({
    queryKey: logsKeys.plugins,
    queryFn: logsApi.getPlugins,
    staleTime: 60000,
  });
}

export function useLogSources() {
  return useQuery({
    queryKey: logsKeys.sources,
    queryFn: logsApi.getSources,
    staleTime: 60000,
  });
}

export function useLogLevels() {
  return useQuery({
    queryKey: logsKeys.levels,
    queryFn: logsApi.getLevels,
    staleTime: Number.POSITIVE_INFINITY, // Never refetch - levels don't change
  });
}

export function useLogStats() {
  return useQuery({
    queryKey: logsKeys.stats,
    queryFn: logsApi.getStats,
    refetchInterval: 30000,
  });
}

export function useClearLogs() {
  const qc = useQueryClient();
  const { clearNew } = useLogsStore();

  return useMutation({
    mutationFn: logsApi.clear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: logsKeys.all });
      clearNew();
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined Hook for LogsPage
// ─────────────────────────────────────────────────────────────────────────────

export function useLogs() {
  const store = useLogsStore();
  const historical = useHistoricalLogs();
  const plugins = useLogPlugins();
  const sources = useLogSources();
  const levels = useLogLevels();
  const stats = useLogStats();
  const clearMutation = useClearLogs();

  // Start live streaming
  useLiveStream();

  // Flatten historical pages into single array
  const historicalLogs = useMemo(() => {
    if (!historical.data?.pages) { return []; }
    return historical.data.pages.flatMap((page) => page.logs);
  }, [historical.data]);

  // Filter new logs client-side and merge with historical
  const mergedLogs = useMemo(() => {
    const filteredNew = store.newLogs.filter((log) => matchesFilters(log, store.filters));
    // New logs first (already sorted desc by arrival), then historical
    return [...filteredNew, ...historicalLogs];
  }, [store.newLogs, historicalLogs, store.filters]);

  return {
    // Merged logs (new + historical)
    logs: mergedLogs,
    newLogsCount: store.newLogs.length,

    // Streaming control
    paused: store.paused,
    togglePaused: store.togglePaused,

    // Historical pagination
    isLoading: historical.isLoading,
    isFetchingNextPage: historical.isFetchingNextPage,
    hasNextPage: historical.hasNextPage,
    fetchNextPage: historical.fetchNextPage,
    refetch: historical.refetch,

    // Filters
    filters: store.filters,
    setLevels: store.setLevels,
    setSources: store.setSources,
    setPluginName: store.setPluginName,
    setSearch: store.setSearch,
    setDateRange: store.setDateRange,
    resetFilters: store.resetFilters,

    // Plugin options (enriched with metadata)
    pluginOptions: plugins.data?.plugins ?? ([] as PluginInfo[]),

    // Source options (all available and used sources)
    sourceOptions: sources.data?.all ?? [],
    usedSources: sources.data?.used ?? [],

    // Level options (all available levels)
    levelOptions: levels.data?.all ?? [],

    // Stats
    stats: stats.data,

    // Actions
    clear: clearMutation.mutateAsync,
    isClearing: clearMutation.isPending,
  };
}

// Re-export for backwards compatibility
export function useLogStream() {
  return useLogs();
}
