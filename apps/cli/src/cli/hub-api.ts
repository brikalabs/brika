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
  readonly author?: string | { name?: string };
  readonly homepage?: string;
  readonly repository?: string | { url?: string };
  readonly state?: 'idle' | 'running' | 'stopped' | 'crashed' | 'loading';
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

export interface PluginMetrics {
  /** PID of the plugin's process, or `null` when the plugin is
   *  disabled / unloaded / failed to start. */
  readonly pid: number | null;
  /** Snapshot from `ps` — `null` when the process has gone away. */
  readonly current: { readonly cpu: number; readonly memory: number } | null;
  /** Rolling history kept by the hub's `MetricsStore`. */
  readonly history: ReadonlyArray<{
    readonly cpu: number;
    readonly memory: number;
    readonly ts: number;
  }>;
}

/** Fetch live CPU + memory for a single plugin. Cheap (~`ps -p` under
 *  the hood) so safe to poll every couple of seconds. */
export async function fetchPluginMetrics(uid: string): Promise<PluginMetrics> {
  const res = await hubFetch(`/api/plugins/${encodeURIComponent(uid)}/metrics`);
  if (!res.ok) {
    throw new Error(`plugin metrics fetch failed: ${res.status}`);
  }
  return (await res.json()) as PluginMetrics;
}

/** Uninstall = disable + unload + remove from `brika.yml` + clean
 *  state/secrets. Hub handles the full teardown; we just call DELETE. */
export async function uninstallPlugin(uid: string): Promise<void> {
  const res = await hubFetch(`/api/plugins/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`uninstall failed: ${res.status} ${await res.text()}`);
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

// ─── Updates ─────────────────────────────────────────────────────────────

export type UpdateChannelId = 'stable' | 'canary';

export interface UpdateInfoDto {
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly updateAvailable: boolean;
  /** True when current version is ahead of the latest release (dev build). */
  readonly devBuild: boolean;
  readonly releaseUrl: string;
  readonly releaseNotes: string;
  readonly publishedAt: string;
  readonly releaseCommit: string;
  readonly currentCommit: string;
  readonly assetName: string | null;
  readonly assetSize: number | null;
  readonly channel: UpdateChannelId;
  /** ISO timestamp the hub last successfully checked. `null` when never. */
  readonly lastCheckedAt: string | null;
}

export async function fetchUpdateInfo(): Promise<UpdateInfoDto> {
  const res = await hubFetch('/api/system/update');
  if (!res.ok) {
    throw new Error(`update check failed: ${res.status}`);
  }
  return (await res.json()) as UpdateInfoDto;
}

export async function fetchUpdateChannel(): Promise<UpdateChannelId> {
  const res = await hubFetch('/api/settings/update-channel');
  if (!res.ok) {
    throw new Error(`channel fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { channel: UpdateChannelId };
  return body.channel;
}

export async function setUpdateChannel(channel: UpdateChannelId): Promise<void> {
  const res = await hubFetch('/api/settings/update-channel', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel }),
  });
  if (!res.ok) {
    throw new Error(`set channel failed: ${res.status} ${await res.text()}`);
  }
}

export interface UpdateProgress {
  readonly phase:
    | 'checking'
    | 'downloading'
    | 'verifying'
    | 'extracting'
    | 'installing'
    | 'restarting'
    | 'complete'
    | 'error';
  readonly message?: string;
  readonly error?: string;
}

/** Apply via `/api/system/update/apply`. Yields progress events until
 *  the server emits `phase: 'restarting'` / `complete` / `error`. */
export async function* applyUpdate(force?: boolean): AsyncGenerator<UpdateProgress> {
  const query = force ? '?force=true' : '';
  const res = await hubFetch(`/api/system/update/apply${query}`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`apply failed to start: ${res.status} ${await res.text()}`);
  }
  for await (const event of streamSseEvents<UpdateProgress>(res)) {
    yield event;
    if (event.phase === 'complete' || event.phase === 'error' || event.phase === 'restarting') {
      return;
    }
  }
}
