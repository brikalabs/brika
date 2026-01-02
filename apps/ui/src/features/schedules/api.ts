import type { Schedule } from "@elia/shared";
import { fetcher } from "@/lib/query";

export const schedulesApi = {
  list: () => fetcher<Schedule[]>("/api/schedules"),
  create: (data: Omit<Schedule, "id">) =>
    fetcher<Schedule>("/api/schedules", { method: "POST", body: JSON.stringify(data) }),
  delete: (id: string) => fetcher<{ ok: boolean }>(`/api/schedules/${id}`, { method: "DELETE" }),
  enable: (id: string) =>
    fetcher<{ ok: boolean }>("/api/schedules/enable", { method: "POST", body: JSON.stringify({ id }) }),
  disable: (id: string) =>
    fetcher<{ ok: boolean }>("/api/schedules/disable", { method: "POST", body: JSON.stringify({ id }) }),
};

export const schedulesKeys = { all: ["schedules"] as const };
