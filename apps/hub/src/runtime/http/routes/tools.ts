import { z } from "zod";
import { route, group } from "@elia/router";
import type { Json } from "@elia/shared";
import { ToolRegistry } from "../../tools/tool-registry";

export const toolsRoutes = group("/api/tools", [
  route.get("/", async ({ inject }) => {
    return inject(ToolRegistry).list();
  }),

  route.post(
    "/call",
    {
      body: z.object({
        name: z.string(),
        args: z.record(z.unknown()).optional(),
      }),
    },
    async ({ body, inject }) => {
      const tools = inject(ToolRegistry);
      return tools.call(body.name, (body.args ?? {}) as Record<string, Json>, {
        traceId: crypto.randomUUID(),
        source: "api",
      });
    },
  ),
]);

