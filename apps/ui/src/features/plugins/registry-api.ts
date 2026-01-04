import { fetcher } from '@/lib/query';

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
    fetcher<{ package: InstalledPackage | null }>(`/api/registry/packages/${name}`),

  /** Check for available updates */
  checkUpdates: () => fetcher<{ updates: UpdateInfo[] }>('/api/registry/updates'),

  /** Uninstall a package */
  uninstall: (name: string) =>
    fetcher<{ success: boolean }>(`/api/registry/packages/${name}`, {
      method: 'DELETE',
    }),

  /**
   * Install a package with SSE progress streaming.
   * Returns an EventSource that emits progress events.
   */
  installStream: (packageName: string, version?: string) => {
    return new Promise<{
      eventSource: EventSource;
      onProgress: (callback: (progress: OperationProgress) => void) => void;
      onComplete: () => Promise<void>;
      close: () => void;
    }>((resolve) => {
      // We use POST with SSE, need to use fetch with ReadableStream
      const body = JSON.stringify({ package: packageName, version });

      fetch('/api/registry/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).then((response) => {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let progressCallback: ((progress: OperationProgress) => void) | null = null;
        let completeResolve: (() => void) | null = null;
        let closed = false;

        const read = async () => {
          if (!reader || closed) return;

          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done || closed) break;

              const text = decoder.decode(value);
              // Parse SSE format: "event: progress\ndata: {...}\n\n"
              const lines = text.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6)) as OperationProgress;
                    progressCallback?.(data);

                    if (data.phase === 'complete' || data.phase === 'error') {
                      completeResolve?.();
                    }
                  } catch {
                    // Ignore parse errors
                  }
                }
              }
            }
          } catch {
            // Stream closed
          }
        };

        read();

        resolve({
          eventSource: null as unknown as EventSource, // Not using EventSource directly
          onProgress: (callback) => {
            progressCallback = callback;
          },
          onComplete: () =>
            new Promise<void>((res) => {
              completeResolve = res;
            }),
          close: () => {
            closed = true;
            reader?.cancel();
          },
        });
      });
    });
  },

  /**
   * Update package(s) with SSE progress streaming.
   */
  updateStream: (packageName?: string) => {
    return new Promise<{
      onProgress: (callback: (progress: OperationProgress) => void) => void;
      onComplete: () => Promise<void>;
      close: () => void;
    }>((resolve) => {
      const body = JSON.stringify({ package: packageName });

      fetch('/api/registry/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).then((response) => {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let progressCallback: ((progress: OperationProgress) => void) | null = null;
        let completeResolve: (() => void) | null = null;
        let closed = false;

        const read = async () => {
          if (!reader || closed) return;

          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done || closed) break;

              const text = decoder.decode(value);
              const lines = text.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6)) as OperationProgress;
                    progressCallback?.(data);

                    if (data.phase === 'complete' || data.phase === 'error') {
                      completeResolve?.();
                    }
                  } catch {
                    // Ignore parse errors
                  }
                }
              }
            }
          } catch {
            // Stream closed
          }
        };

        read();

        resolve({
          onProgress: (callback) => {
            progressCallback = callback;
          },
          onComplete: () =>
            new Promise<void>((res) => {
              completeResolve = res;
            }),
          close: () => {
            closed = true;
            reader?.cancel();
          },
        });
      });
    });
  },
};

export const registryKeys = {
  packages: ['registry', 'packages'] as const,
  updates: ['registry', 'updates'] as const,
};
