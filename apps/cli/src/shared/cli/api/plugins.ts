/**
 * Plugin lifecycle endpoints — list, README, action (enable/disable/
 * reload/kill), live metrics, uninstall.
 *
 * Source of truth lives in `apps/hub/src/runtime/http/routes/plugins.ts`.
 * Schemas here are deliberately structural / partial: the TUI only
 * consumes what it displays.
 */

import { hubFetch } from '../hub-client';

export type PluginHealth =
  | 'running'
  | 'stopped'
  | 'crashed'
  | 'degraded'
  | 'installing'
  | 'updating'
  | 'restarting'
  | 'crash-loop'
  | 'incompatible';

export interface PluginListItem {
  readonly uid: string;
  readonly name: string;
  readonly displayName?: string | null;
  readonly version: string;
  readonly status: PluginHealth;
  readonly pid: number | null;
  readonly description?: string | null;
  readonly author?: string | { name?: string } | null;
  readonly homepage?: string | null;
  readonly repository?: string | { url?: string } | null;
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
