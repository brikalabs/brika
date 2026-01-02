import type { PluginSummary } from "@elia/shared";
import { fetcher } from "@/lib/query";

export const pluginsApi = {
  list: () => fetcher<PluginSummary[]>("/api/plugins"),
  getById: (id: string) => fetcher<PluginSummary>(`/api/plugins/${encodeURIComponent(id)}`),
  getIconUrl: (uid: string) => `/api/plugins/${uid}/icon`,
  enable: (ref: string) =>
    fetcher<{ ok: boolean }>("/api/plugins/enable", {
      method: "POST",
      body: JSON.stringify({ ref }),
    }),
  disable: (ref: string) =>
    fetcher<{ ok: boolean }>("/api/plugins/disable", {
      method: "POST",
      body: JSON.stringify({ ref }),
    }),
  reload: (ref: string) =>
    fetcher<{ ok: boolean }>("/api/plugins/reload", {
      method: "POST",
      body: JSON.stringify({ ref }),
    }),
  kill: (ref: string) =>
    fetcher<{ ok: boolean }>("/api/plugins/kill", {
      method: "POST",
      body: JSON.stringify({ ref }),
    }),
};

export const pluginsKeys = {
  all: ["plugins"] as const,
  detail: (id: string) => ["plugins", id] as const,
};
