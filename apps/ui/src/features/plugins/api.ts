import type { Plugin } from '@brika/shared';
import { fetcher } from '@/lib/query';

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
};

export const pluginsKeys = {
  all: ['plugins'] as const,
  detail: (uid: string) => ['plugins', uid] as const,
  readme: (uid: string) => ['plugins', uid, 'readme'] as const,
};
