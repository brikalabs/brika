import { fetcher } from '@/lib/query';
import { fetchProgressStream } from '@/lib/sse-stream';

// Types matching the backend
export interface OperationProgress {
  phase: 'resolving' | 'downloading' | 'linking' | 'complete' | 'error';
  operation: 'install' | 'update' | 'uninstall';
  package: string;
  currentVersion?: string;
  targetVersion?: string;
  progress?: number;
  message: string;
  error?: string;
}

export interface UpdateInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

export interface InstalledPackage {
  name: string;
  version: string;
  path: string;
}

export const registryApi = {
  /** List all installed packages */
  list: () => fetcher<{ packages: InstalledPackage[] }>('/api/registry/packages'),

  /** Get a specific package */
  get: (name: string) =>
    fetcher<{ package: InstalledPackage | null }>(
      `/api/registry/packages/${encodeURIComponent(name)}`
    ),

  /** Check for available updates */
  checkUpdates: () => fetcher<{ updates: UpdateInfo[] }>('/api/registry/updates'),

  /** Uninstall a package */
  uninstall: (name: string) =>
    fetcher<{ success: boolean }>(`/api/registry/packages/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),

  /** Install a package with SSE progress streaming */
  installStream: (packageName: string, version?: string) =>
    fetchProgressStream<OperationProgress>('/api/registry/install', {
      body: JSON.stringify({ package: packageName, version }),
    }),

  /** Update package(s) with SSE progress streaming */
  updateStream: (packageName?: string) =>
    fetchProgressStream<OperationProgress>('/api/registry/update', {
      body: JSON.stringify({ package: packageName }),
    }),
};

export const registryKeys = {
  packages: ['registry', 'packages'] as const,
  updates: ['registry', 'updates'] as const,
};
