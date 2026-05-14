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
  const res = await hubFetch('/api/plugins/');
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
  return res.text();
}

export async function loadPlugin(source: string): Promise<void> {
  const res = await hubFetch('/api/plugins/load', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  if (!res.ok) {
    throw new Error(`plugin install failed: ${res.status} ${await res.text()}`);
  }
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
  const res = await hubFetch('/api/workflows/');
  if (!res.ok) {
    throw new Error(`workflows fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { workflows?: WorkflowSummaryDto[] } | WorkflowSummaryDto[];
  if (Array.isArray(body)) {
    return [...body];
  }
  return [...(body.workflows ?? [])];
}

export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
}

export async function fetchUsers(): Promise<UserDto[]> {
  const res = await hubFetch('/api/users/');
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
