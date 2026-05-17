/**
 * Log endpoints — recent tail + server-side `/api/logs` search (same path
 * the web UI uses). Pushing filtering into the hub's SQLite store keeps
 * the TUI responsive on a 5k-line ring buffer.
 */

import { hubFetch } from '../hub-client';

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

export interface LogQueryParams {
  readonly search?: string;
  readonly level?: ReadonlyArray<string>;
  readonly source?: ReadonlyArray<string>;
  readonly pluginName?: string;
  readonly startTs?: number;
  readonly endTs?: number;
  readonly cursor?: number;
  readonly limit?: number;
  readonly order?: 'asc' | 'desc';
}

export type StoredLogEventDto = LogEventDto & { readonly id: number };

export interface LogQueryResult {
  readonly logs: ReadonlyArray<StoredLogEventDto>;
  readonly nextCursor: number | null;
}

/**
 * Server-side log query — hits the same `/api/logs` endpoint the web
 * UI uses. Pushes search + filtering into the hub's SQLite store
 * instead of scanning the in-memory ring buffer per-render, so a 5k
 * line tail with a `/search` query stays responsive.
 */
export async function queryLogs(
  params: Readonly<LogQueryParams> = {},
  init: RequestInit = {}
): Promise<LogQueryResult> {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set('search', params.search);
  }
  if (params.level && params.level.length > 0) {
    qs.set('level', params.level.join(','));
  }
  if (params.source && params.source.length > 0) {
    qs.set('source', params.source.join(','));
  }
  if (params.pluginName) {
    qs.set('pluginName', params.pluginName);
  }
  if (params.startTs !== undefined) {
    qs.set('startTs', String(params.startTs));
  }
  if (params.endTs !== undefined) {
    qs.set('endTs', String(params.endTs));
  }
  if (params.cursor !== undefined) {
    qs.set('cursor', String(params.cursor));
  }
  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }
  if (params.order) {
    qs.set('order', params.order);
  }
  const query = qs.toString();
  const url = query ? `/api/logs?${query}` : '/api/logs';
  const res = await hubFetch(url, init);
  if (!res.ok) {
    throw new Error(`log query failed: ${res.status}`);
  }
  return (await res.json()) as LogQueryResult;
}
