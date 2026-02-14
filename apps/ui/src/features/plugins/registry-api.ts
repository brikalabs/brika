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

// Stream utilities
interface ProgressStream {
  onProgress: (callback: (progress: OperationProgress) => void) => void;
  onComplete: () => Promise<void>;
  close: () => void;
}

function parseSseLine(line: string): OperationProgress | null {
  if (!line.startsWith('data: ')) return null;
  try {
    return JSON.parse(line.slice(6)) as OperationProgress;
  } catch {
    return null;
  }
}

function processChunk(text: string, onData: (data: OperationProgress) => void): void {
  for (const line of text.split('\n')) {
    const data = parseSseLine(line);
    if (data) onData(data);
  }
}

function createProgressStream(response: Response): ProgressStream {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let progressCallback: ((progress: OperationProgress) => void) | null = null;
  let completeResolve: (() => void) | null = null;
  let closed = false;

  const handleData = (data: OperationProgress) => {
    progressCallback?.(data);
    if (data.phase === 'complete' || data.phase === 'error') {
      completeResolve?.();
    }
  };

  const read = async () => {
    if (!reader || closed) return;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done || closed) break;
        processChunk(decoder.decode(value), handleData);
      }
    } catch {
      // Stream closed
    }
  };

  read();

  return {
    onProgress: (callback) => {
      progressCallback = callback;
    },
    onComplete: () =>
      new Promise<void>((resolve) => {
        completeResolve = resolve;
      }),
    close: () => {
      closed = true;
      reader?.cancel();
    },
  };
}

async function fetchWithProgressStream(
  url: string,
  body: Record<string, unknown>
): Promise<ProgressStream> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return createProgressStream(response);
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

  /** Install a package with SSE progress streaming */
  installStream: (packageName: string, version?: string) =>
    fetchWithProgressStream('/api/registry/install', { package: packageName, version }),

  /** Update package(s) with SSE progress streaming */
  updateStream: (packageName?: string) =>
    fetchWithProgressStream('/api/registry/update', { package: packageName }),
};

export const registryKeys = {
  packages: ['registry', 'packages'] as const,
  updates: ['registry', 'updates'] as const,
};
