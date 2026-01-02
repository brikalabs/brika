import { z } from "zod";
import { route, group } from "@elia/router";
import { LogRouter } from "../../logs/log-router";
import { LogStore } from "../../logs/log-store";
import { PluginManager } from "../../plugins/plugin-manager";

const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
const LogSourceSchema = z.enum(["hub", "plugin", "installer", "registry", "stderr", "automation"]);

const LogQuerySchema = z.object({
  level: z
    .union([
      LogLevelSchema,
      z.string().transform((s) => s.split(",") as ("debug" | "info" | "warn" | "error")[]),
    ])
    .optional(),
  source: z
    .union([
      LogSourceSchema,
      z
        .string()
        .transform(
          (s) => s.split(",") as ("hub" | "plugin" | "installer" | "registry" | "stderr" | "automation")[],
        ),
    ])
    .optional(),
  pluginRef: z.string().optional(),
  search: z.string().optional(),
  startTs: z.coerce.number().optional(),
  endTs: z.coerce.number().optional(),
  cursor: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const LogClearSchema = z.object({
  level: z.union([LogLevelSchema, z.array(LogLevelSchema)]).optional(),
  source: z.union([LogSourceSchema, z.array(LogSourceSchema)]).optional(),
  pluginRef: z.string().optional(),
  startTs: z.coerce.number().optional(),
  endTs: z.coerce.number().optional(),
});

export const logsRoutes = group("/api/logs", [
  // GET /api/logs - Query historical logs with filters
  route.get("/", { query: LogQuerySchema }, async ({ query, inject }) => {
    const store = inject(LogStore);
    return store.query(query);
  }),

  // GET /api/logs/recent - Get ring buffer (in-memory recent logs)
  route.get("/recent", async ({ inject }) => {
    return inject(LogRouter).query();
  }),

  // GET /api/logs/plugins - Get distinct plugin refs with metadata for filter dropdown
  route.get("/plugins", async ({ inject }) => {
    const store = inject(LogStore);
    const pm = inject(PluginManager);
    const refs = store.getPluginRefs();

    // Build a map of ref -> plugin info from running/known plugins
    const pluginList = pm.list();
    const refToPlugin = new Map(pluginList.map((p) => [p.ref, p]));

    // Enrich with plugin metadata
    const pluginInfos = refs.map((ref) => {
      const plugin = refToPlugin.get(ref);
      return {
        ref,
        id: plugin?.id ?? ref,
        name: plugin?.metadata?.name ?? ref.split("/").pop()?.replace(/\.ts$/, "") ?? ref,
        version: plugin?.version,
      };
    });

    return { plugins: pluginInfos };
  }),

  // GET /api/logs/stats - Get log statistics
  route.get("/stats", async ({ inject }) => {
    const store = inject(LogStore);
    return {
      total: store.count(),
      ringBufferSize: inject(LogRouter).query().length,
    };
  }),

  // DELETE /api/logs - Clear logs with optional filters
  route.delete("/", { body: LogClearSchema.optional() }, async ({ body, inject }) => {
    const store = inject(LogStore);
    const deleted = store.clear(body ?? {});
    return { ok: true, deleted };
  }),
]);
