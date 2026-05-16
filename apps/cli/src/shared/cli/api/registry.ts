/**
 * Registry search + install — the Plugins → Search tab talks to these.
 * Backed by `/api/registry/*` on the hub side.
 */

import { hubFetch } from '../hub-client';
import { streamSseEvents } from '../sse';

export interface RegistrySearchResult {
  readonly name: string;
  readonly version: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly installed: boolean;
  readonly installedVersion?: string;
  readonly compatible: boolean;
  readonly compatibilityReason?: string;
  readonly downloadCount: number;
  readonly source: string;
}

/** Fetch a registry plugin's README markdown. Returns `''` when the
 *  package shipped without one (the hub answers with `{readme: null}`). */
export async function fetchRegistryReadme(name: string): Promise<string> {
  const res = await hubFetch(`/api/registry/plugins/${encodeURIComponent(name)}/readme`);
  if (!res.ok) {
    throw new Error(`registry readme fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { readme?: string | null };
  return body.readme ?? '';
}

/** Search the configured registries. Empty `q` returns popular packages. */
export async function searchRegistry(q: string): Promise<RegistrySearchResult[]> {
  const params = new URLSearchParams();
  if (q.trim().length > 0) {
    params.set('q', q.trim());
  }
  params.set('limit', '25');
  const res = await hubFetch(`/api/registry/search?${params}`);
  if (!res.ok) {
    throw new Error(`registry search failed: ${res.status}`);
  }
  // The hub returns `{ plugins: [...], total }` per StoreService.search.
  const body = (await res.json()) as {
    plugins?: ReadonlyArray<{
      package: { name: string; version: string; displayName?: string; description?: string };
      installVersion: string;
      installed: boolean;
      installedVersion?: string;
      compatible: boolean;
      compatibilityReason?: string;
      downloadCount: number;
      source: string;
    }>;
  };
  return (body.plugins ?? []).map((p) => ({
    name: p.package.name,
    version: p.installVersion || p.package.version,
    displayName: p.package.displayName,
    description: p.package.description,
    installed: p.installed,
    installedVersion: p.installedVersion,
    compatible: p.compatible,
    compatibilityReason: p.compatibilityReason,
    downloadCount: p.downloadCount,
    source: p.source,
  }));
}

export interface InstallProgress {
  readonly phase: string;
  readonly message?: string;
  readonly progress?: number;
}

/** Install via `/api/registry/install`. Yields progress events until the
 *  server emits `phase: 'complete'` or `phase: 'error'`. */
export async function* installFromRegistry(
  packageName: string,
  version?: string
): AsyncGenerator<InstallProgress> {
  const res = await hubFetch('/api/registry/install', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ package: packageName, version }),
  });
  if (!res.ok) {
    throw new Error(`install failed to start: ${res.status} ${await res.text()}`);
  }
  for await (const event of streamSseEvents<InstallProgress>(res)) {
    yield event;
    if (event.phase === 'complete' || event.phase === 'error') {
      return;
    }
  }
}
