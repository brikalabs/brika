import { group, route } from '@brika/router';
import { z } from 'zod';
import { Logger } from '@/runtime/logs/log-router';
import { LogStore } from '@/runtime/logs/log-store';
import { PluginManager } from '@/runtime/plugins/plugin-manager';

const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
const LogSourceSchema = z.enum(['hub', 'plugin', 'installer', 'registry', 'stderr', 'automation']);

const LogQuerySchema = z.object({
  level: z
    .union([
      LogLevelSchema,
      z.string().transform((s) => s.split(',') as ('debug' | 'info' | 'warn' | 'error')[]),
    ])
    .optional(),
  source: z
    .union([
      LogSourceSchema,
      z
        .string()
        .transform(
          (s) =>
            s.split(',') as (
              | 'hub'
              | 'plugin'
              | 'installer'
              | 'registry'
              | 'stderr'
              | 'automation'
            )[]
        ),
    ])
    .optional(),
  pluginName: z.string().optional(),
  search: z.string().optional(),
  startTs: z.coerce.number().optional(),
  endTs: z.coerce.number().optional(),
  cursor: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const LogClearSchema = z.object({
  level: z.union([LogLevelSchema, z.array(LogLevelSchema)]).optional(),
  source: z.union([LogSourceSchema, z.array(LogSourceSchema)]).optional(),
  pluginName: z.string().optional(),
  startTs: z.coerce.number().optional(),
  endTs: z.coerce.number().optional(),
});

export const logsRoutes = group('/api/logs', [
  // GET /api/logs - Query historical logs with filters
  route.get('/', { query: LogQuerySchema }, ({ query, inject }) => {
    const store = inject(LogStore);
    return store.query(query);
  }),

  // GET /api/logs/recent - Get ring buffer (in-memory recent logs)
  route.get('/recent', ({ inject }) => {
    return inject(Logger).query();
  }),

  // GET /api/logs/plugins - Get distinct plugin names with metadata for filter dropdown
  route.get('/plugins', ({ inject }) => {
    const store = inject(LogStore);
    const pm = inject(PluginManager);
    const names = store.getPluginNames();

    // Build a map of name -> plugin info from running/known plugins
    const pluginList = pm.list();
    const nameToPlugin = new Map(pluginList.map((p) => [p.name, p]));

    // Enrich with plugin metadata
    const pluginInfos = names.map((name) => {
      const plugin = nameToPlugin.get(name);
      return {
        name,
        uid: plugin?.uid,
        version: plugin?.version,
      };
    });

    return { plugins: pluginInfos };
  }),

  // GET /api/logs/stats - Get log statistics
  route.get('/stats', ({ inject }) => {
    const store = inject(LogStore);
    return {
      total: store.count(),
      ringBufferSize: inject(Logger).query().length,
    };
  }),

  // DELETE /api/logs - Clear logs with optional filters
  route.delete('/', { body: LogClearSchema.optional() }, ({ body, inject }) => {
    const store = inject(LogStore);
    const deleted = store.clear(body ?? {});
    return { ok: true, deleted };
  }),
]);
