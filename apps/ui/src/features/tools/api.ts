import type { ToolSummary } from "@elia/shared";
import { fetcher } from "@/lib/query";

export const toolsApi = {
  list: () => fetcher<ToolSummary[]>("/api/tools"),
  call: (name: string, args: Record<string, unknown>) =>
    fetcher<{ ok: boolean; content?: string }>("/api/tools/call", {
      method: "POST", body: JSON.stringify({ name, args }),
    }),
};

export const toolsKeys = { all: ["tools"] as const };

