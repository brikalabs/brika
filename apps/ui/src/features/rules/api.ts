import type { Rule } from "@elia/shared";
import { fetcher } from "@/lib/query";

export const rulesApi = {
  list: () => fetcher<Rule[]>("/api/rules"),
  create: (data: Omit<Rule, "id">) =>
    fetcher<Rule>("/api/rules", { method: "POST", body: JSON.stringify(data) }),
  delete: (id: string) => fetcher<{ ok: boolean }>(`/api/rules/${id}`, { method: "DELETE" }),
  enable: (id: string) =>
    fetcher<{ ok: boolean }>("/api/rules/enable", { method: "POST", body: JSON.stringify({ id }) }),
  disable: (id: string) =>
    fetcher<{ ok: boolean }>("/api/rules/disable", { method: "POST", body: JSON.stringify({ id }) }),
};

export const rulesKeys = { all: ["rules"] as const };

