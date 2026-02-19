import type { PluginSearchResult, StorePlugin, VerifiedPluginsList } from '@brika/shared';
import { fetcher } from '@/lib/query';

export const storeApi = {
  /** Search npm for Brika plugins */
  search: (params: { q?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.set('q', params.q);
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.offset) searchParams.set('offset', String(params.offset));

    return fetcher<{ plugins: PluginSearchResult[]; total: number }>(
      `/api/registry/search?${searchParams.toString()}`
    );
  },

  /** Get verified plugins list */
  getVerified: () => fetcher<VerifiedPluginsList>('/api/registry/verified'),

  /** Get enriched plugin details */
  getPluginDetails: (name: string) =>
    fetcher<StorePlugin>(`/api/registry/plugins/${encodeURIComponent(name)}`),

  /** Get plugin README from npm */
  getPluginReadme: (name: string) =>
    fetcher<{ readme: string | null; filename: string | null }>(
      `/api/registry/plugins/${encodeURIComponent(name)}/readme`
    ),

  /** Get current Brika version */
  getCurrentVersion: () => fetcher<{ version: string }>('/api/registry/version'),
};

export const storeKeys = {
  all: ['store'] as const,
  search: (params: { q?: string; limit?: number; offset?: number }) =>
    ['store', 'search', params] as const,
  verified: ['store', 'verified'] as const,
  plugin: (name: string) => ['store', 'plugin', name] as const,
  readme: (name: string) => ['store', 'readme', name] as const,
  version: ['store', 'version'] as const,
};
