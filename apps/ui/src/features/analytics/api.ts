import { fetcher } from '@/lib/query';
import type { Json } from '@/types';
import type {
  EventNameCount,
  EventQueryParams,
  EventQueryResult,
  EventStats,
  TimeSeriesParams,
  TimeSeriesResult,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Anonymous session id
// ─────────────────────────────────────────────────────────────────────────────

const DISTINCT_ID_KEY = 'brika.analytics.distinctId';

/**
 * Module-level fallback: if localStorage is unavailable (private mode in some
 * browsers, sandboxed iframes), we still want every event in this tab/session
 * to share one id rather than collapsing to the literal `'anonymous'` on
 * every call — that would make dedup at the platform impossible.
 */
let inMemoryDistinctId: string | null = null;

/**
 * A durable anonymous device id (localStorage) so usage can be correlated
 * across sessions on this browser without any account/PII — the standard
 * product-analytics pattern (anonymous-by-default; the hub additionally
 * stamps the authenticated user id server-side when logged in).
 *
 * If localStorage isn't available, we fall back to a per-process random id
 * memoised at module scope, so within a single tab/session the id is at
 * least consistent across captures.
 */
export function getDistinctId(): string {
  try {
    const existing = localStorage.getItem(DISTINCT_ID_KEY);
    if (existing) {
      return existing;
    }
    const id = crypto.randomUUID();
    localStorage.setItem(DISTINCT_ID_KEY, id);
    return id;
  } catch {
    inMemoryDistinctId ??= `anon-${crypto.randomUUID()}`;
    return inMemoryDistinctId;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query string
// ─────────────────────────────────────────────────────────────────────────────

function buildQueryString(params: EventQueryParams): string {
  const searchParams = new URLSearchParams();
  if (params.name) {
    const names = Array.isArray(params.name) ? params.name : [params.name];
    searchParams.set('name', names.join(','));
  }
  if (params.source) {
    const sources = Array.isArray(params.source) ? params.source : [params.source];
    searchParams.set('source', sources.join(','));
  }
  if (params.pluginName) {
    searchParams.set('pluginName', params.pluginName);
  }
  if (params.distinctId) {
    searchParams.set('distinctId', params.distinctId);
  }
  if (params.userId) {
    searchParams.set('userId', params.userId);
  }
  if (params.search) {
    searchParams.set('search', params.search);
  }
  if (params.startTs) {
    searchParams.set('startTs', String(params.startTs));
  }
  if (params.endTs) {
    searchParams.set('endTs', String(params.endTs));
  }
  if (params.cursor) {
    searchParams.set('cursor', String(params.cursor));
  }
  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }
  if (params.order) {
    searchParams.set('order', params.order);
  }
  return searchParams.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

export const analyticsApi = {
  /**
   * Record a feature-usage event. Fire-and-forget: failures are swallowed so
   * analytics never disrupts the UI. The anonymous session id is attached
   * automatically.
   */
  capture(name: string, props?: Record<string, Json>): void {
    void fetcher('/api/analytics/capture', {
      method: 'POST',
      body: JSON.stringify({ name, props, distinctId: getDistinctId() }),
    }).catch(() => {
      // Best-effort; intentionally ignored.
    });
  },

  query: (params: EventQueryParams) => {
    const qs = buildQueryString(params);
    const suffix = qs ? `?${qs}` : '';
    return fetcher<EventQueryResult>(`/api/analytics${suffix}`);
  },

  getNames: () => fetcher<{ names: EventNameCount[] }>('/api/analytics/names'),

  getStats: () => fetcher<EventStats>('/api/analytics/stats'),

  getTimeSeries: (params: TimeSeriesParams = {}) => {
    const search = new URLSearchParams();
    if (params.bucketMs) {
      search.set('bucketMs', String(params.bucketMs));
    }
    if (params.name) {
      const names = Array.isArray(params.name) ? params.name : [params.name];
      search.set('name', names.join(','));
    }
    if (params.source) {
      const sources = Array.isArray(params.source) ? params.source : [params.source];
      search.set('source', sources.join(','));
    }
    if (params.pluginName) {
      search.set('pluginName', params.pluginName);
    }
    if (params.startTs) {
      search.set('startTs', String(params.startTs));
    }
    if (params.endTs) {
      search.set('endTs', String(params.endTs));
    }
    const qs = search.toString();
    const suffix = qs ? `?${qs}` : '';
    return fetcher<TimeSeriesResult>(`/api/analytics/timeseries${suffix}`);
  },

  clear: (params?: Partial<EventQueryParams>) =>
    fetcher<{ ok: boolean; deleted: number }>('/api/analytics', {
      method: 'DELETE',
      body: JSON.stringify(params ?? {}),
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const analyticsKeys = {
  all: ['analytics'] as const,
  query: (params: EventQueryParams) => ['analytics', 'query', params] as const,
  names: ['analytics', 'names'] as const,
  stats: ['analytics', 'stats'] as const,
  timeseries: (params: TimeSeriesParams) => ['analytics', 'timeseries', params] as const,
};
