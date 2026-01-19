import type { Plugin, PluginPreferences } from '@brika/shared';
import { fetcher } from '@/lib/query';

export interface MetricsSample {
  ts: number;
  cpu: number;
  memory: number;
}

export interface PluginMetrics {
  pid: number | null;
  current: { cpu: number; memory: number } | null;
  history: MetricsSample[];
}

export const pluginsApi = {
  list: () => fetcher<Plugin[]>('/api/plugins'),
  getByUid: (uid: string) => fetcher<Plugin>(`/api/plugins/${uid}`),
  getIconUrl: (uid: string) => `/api/plugins/${uid}/icon`,

  /** Get plugin README content */
  getReadme: (uid: string) =>
    fetcher<{ readme: string | null; filename: string | null }>(`/api/plugins/${uid}/readme`),

  /** Load a new plugin by ref */
  load: (ref: string) =>
    fetcher<{ ok: boolean }>('/api/plugins/load', {
      method: 'POST',
      body: JSON.stringify({ ref }),
    }),

  /** Enable a stopped plugin by uid */
  enable: (uid: string) =>
    fetcher<{ ok: boolean }>(`/api/plugins/${uid}/enable`, {
      method: 'POST',
    }),

  /** Disable a running plugin by uid */
  disable: (uid: string) =>
    fetcher<{ ok: boolean }>(`/api/plugins/${uid}/disable`, {
      method: 'POST',
    }),

  /** Reload a plugin by uid */
  reload: (uid: string) =>
    fetcher<{ ok: boolean }>(`/api/plugins/${uid}/reload`, {
      method: 'POST',
    }),

  /** Kill a plugin by uid */
  kill: (uid: string) =>
    fetcher<{ ok: boolean }>(`/api/plugins/${uid}/kill`, {
      method: 'POST',
    }),

  /** Uninstall a plugin by uid (fully removes it from the system) */
  uninstall: (uid: string) =>
    fetcher<{ ok: boolean }>(`/api/plugins/${uid}`, {
      method: 'DELETE',
    }),

  /** Get plugin config (schema + values) */
  getConfig: (uid: string) => fetcher<PluginPreferences>(`/api/plugins/${uid}/config`),

  /** Update plugin config */
  setConfig: (uid: string, config: Record<string, unknown>) =>
    fetcher<{ ok: boolean }>(`/api/plugins/${uid}/config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  /** Get plugin metrics (CPU, memory) */
  getMetrics: (uid: string) => fetcher<PluginMetrics>(`/api/plugins/${uid}/metrics`),
};

export const pluginsKeys = {
  all: ['plugins'] as const,
  detail: (uid: string) => ['plugins', uid] as const,
  readme: (uid: string) => ['plugins', uid, 'readme'] as const,
  config: (uid: string) => ['plugins', uid, 'config'] as const,
  metrics: (uid: string) => ['plugins', uid, 'metrics'] as const,
};
