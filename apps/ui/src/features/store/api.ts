import { fetcher } from "@/lib/query";

export const storeApi = {
  install: (ref: string, wanted?: string) =>
    fetcher<{ ok: boolean }>("/api/store/install", { method: "POST", body: JSON.stringify({ ref, wanted }) }),
  uninstall: (ref: string) =>
    fetcher<{ ok: boolean }>("/api/store/uninstall", { method: "POST", body: JSON.stringify({ ref }) }),
};

