import type { LogEvent, LogLevel, LogSource } from "@brika/shared";
import { API_BASE, fetcher } from "@/lib/query";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LogQueryParams {
  level?: LogLevel | LogLevel[];
  source?: LogSource | LogSource[];
  pluginRef?: string;
  search?: string;
  startTs?: number;
  endTs?: number;
  cursor?: number;
  limit?: number;
  order?: "asc" | "desc";
}

export interface StoredLogEvent extends LogEvent {
  id: number;
}

export interface LogQueryResult {
  logs: StoredLogEvent[];
  nextCursor: number | null;
}

export interface LogStats {
  total: number;
  ringBufferSize: number;
}

export interface PluginInfo {
  ref: string;
  id: string;
  name: string;
  version?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

function buildQueryString(params: LogQueryParams): string {
  const searchParams = new URLSearchParams();

  if (params.level) {
    const levels = Array.isArray(params.level) ? params.level : [params.level];
    searchParams.set("level", levels.join(","));
  }
  if (params.source) {
    const sources = Array.isArray(params.source) ? params.source : [params.source];
    searchParams.set("source", sources.join(","));
  }
  if (params.pluginRef) searchParams.set("pluginRef", params.pluginRef);
  if (params.search) searchParams.set("search", params.search);
  if (params.startTs) searchParams.set("startTs", String(params.startTs));
  if (params.endTs) searchParams.set("endTs", String(params.endTs));
  if (params.cursor) searchParams.set("cursor", String(params.cursor));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.order) searchParams.set("order", params.order);

  return searchParams.toString();
}

export const logsApi = {
  query: (params: LogQueryParams) => {
    const qs = buildQueryString(params);
    return fetcher<LogQueryResult>(`${API_BASE}/api/logs${qs ? `?${qs}` : ""}`);
  },

  getPlugins: () => fetcher<{ plugins: PluginInfo[] }>(`${API_BASE}/api/logs/plugins`),

  getStats: () => fetcher<LogStats>(`${API_BASE}/api/logs/stats`),

  clear: (params?: Partial<LogQueryParams>) =>
    fetcher<{ ok: boolean; deleted: number }>(`${API_BASE}/api/logs`, {
      method: "DELETE",
      body: JSON.stringify(params ?? {}),
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────────────────

export const logsKeys = {
  all: ["logs"] as const,
  query: (params: LogQueryParams) => ["logs", "query", params] as const,
  plugins: ["logs", "plugins"] as const,
  stats: ["logs", "stats"] as const,
};
