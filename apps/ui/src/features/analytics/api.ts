import { fetcher } from '@/lib/query';
import type { Json } from '@/types';
import type { EventNameCount, EventQueryParams, EventQueryResult, EventStats } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Anonymous session id
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = 'brika.analytics.distinctId';

/**
 * A stable-per-tab anonymous id so events from one session can be correlated
 * without any account/PII. Regenerated when sessionStorage is unavailable.
 */
export function getDistinctId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      return existing;
    }
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return 'anonymous';
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
    return fetcher<EventQueryResult>(`/api/analytics${qs ? `?${qs}` : ''}`);
  },

  getNames: () => fetcher<{ names: EventNameCount[] }>('/api/analytics/names'),

  getStats: () => fetcher<EventStats>('/api/analytics/stats'),

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
};
