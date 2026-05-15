/**
 * Typed fetch helpers for the hub HTTP API. Each function maps to one
 * existing endpoint on the hub side — see `apps/hub/src/runtime/http/
 * routes/` for the source of truth on shapes. Schemas here are
 * deliberately structural / partial: the TUI only consumes what it
 * displays, and tolerates extra fields silently.
 *
 * All fetchers use `hubFetch` so `BRIKA_HOST` / `BRIKA_PORT` work
 * out of the box.
 */

import { hubFetch } from './hub-client';
import { streamSseEvents } from './sse';

export interface PluginListItem {
  readonly uid: string;
  readonly name: string;
  readonly displayName?: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly description?: string;
}

export interface PluginListResponse {
  readonly plugins: ReadonlyArray<PluginListItem>;
}

export async function fetchPlugins(): Promise<PluginListItem[]> {
  const res = await hubFetch('/api/plugins');
  if (!res.ok) {
    throw new Error(`plugins fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as PluginListResponse | PluginListItem[];
  if (Array.isArray(body)) {
    return [...body];
  }
  return [...body.plugins];
}

export async function fetchPluginReadme(uid: string): Promise<string> {
  const res = await hubFetch(`/api/plugins/${encodeURIComponent(uid)}/readme`);
  if (!res.ok) {
    throw new Error(`readme fetch failed: ${res.status}`);
  }
  // Hub returns `{ readme: string | null, filename: string | null }`.
  // A `null` body means the plugin shipped without a README — surface
  // that as a friendly empty string so the Markdown renderer can do
  // its "no readme" branch.
  const body = (await res.json()) as { readme?: string | null };
  return body.readme ?? '';
}

export async function pluginAction(
  uid: string,
  action: 'enable' | 'disable' | 'reload' | 'kill'
): Promise<void> {
  const res = await hubFetch(`/api/plugins/${encodeURIComponent(uid)}/${action}`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(`${action} failed: ${res.status}`);
  }
}

export interface WorkflowSummaryDto {
  readonly id: string;
  readonly name?: string;
  readonly enabled?: boolean;
  readonly state?: 'idle' | 'running' | 'failed';
}

export async function fetchWorkflows(): Promise<WorkflowSummaryDto[]> {
  const res = await hubFetch('/api/workflows');
  if (!res.ok) {
    throw new Error(`workflows fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { workflows?: WorkflowSummaryDto[] } | WorkflowSummaryDto[];
  if (Array.isArray(body)) {
    return [...body];
  }
  return [...(body.workflows ?? [])];
}

// ─── Registry search + install ──────────────────────────────────────────────

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

export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
}

export async function fetchUsers(): Promise<UserDto[]> {
  const res = await hubFetch('/api/users');
  if (!res.ok) {
    throw new Error(`users fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { users?: UserDto[] } | UserDto[];
  if (Array.isArray(body)) {
    return [...body];
  }
  return [...(body.users ?? [])];
}

export interface LogEventDto {
  readonly ts: number;
  readonly level: string;
  readonly source: string;
  readonly pluginName?: string;
  readonly message: string;
}

export async function fetchRecentLogs(): Promise<LogEventDto[]> {
  const res = await hubFetch('/api/logs/recent');
  if (!res.ok) {
    throw new Error(`recent logs fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { events?: LogEventDto[] } | LogEventDto[];
  if (Array.isArray(body)) {
    return [...body];
  }
  return [...(body.events ?? [])];
}
