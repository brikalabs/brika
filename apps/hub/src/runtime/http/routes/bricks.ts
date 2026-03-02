import { group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { BrickTypeRegistry } from '@/runtime/bricks';
import type { RegisteredBrickType } from '@/runtime/bricks/brick-type-registry';
import { ModuleCompiler } from '@/runtime/modules';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import type { Json } from '@/types';

async function toBrickTypeDto(
  t: RegisteredBrickType,
  lifecycle: PluginLifecycle,
  compiler: ModuleCompiler
) {
  const process = t.config?.some((f) => f.type === 'dynamic-dropdown')
    ? lifecycle.getProcess(t.pluginName)
    : null;

  const pluginUid = t.pluginUid ?? lifecycle.getProcess(t.pluginName)?.uid;

  // Build the full module URL so the frontend doesn't assemble it
  let moduleUrl: string | undefined;
  if (pluginUid) {
    const entry = compiler.get(`${t.pluginName}:bricks/${t.localId}`);
    if (entry) {
      moduleUrl = `/api/bricks/modules/${encodeURIComponent(pluginUid)}/${t.localId}.${entry.hash}.js`;
    }
  }

  return {
    id: t.fullId,
    localId: t.localId,
    pluginName: t.pluginName,
    pluginUid,
    name: t.name,
    description: t.description,
    category: t.category,
    icon: t.icon,
    color: t.color,
    families: t.families,
    minSize: t.minSize,
    maxSize: t.maxSize,
    moduleUrl,
    config:
      process && t.config
        ? await Promise.all(
            t.config.map(async (f) => {
              if (f.type !== 'dynamic-dropdown') {
                return f;
              }
              return {
                ...f,
                options: await process.fetchPreferenceOptions(f.name),
              };
            })
          )
        : t.config,
  };
}

export const bricksRoutes = group({
  prefix: '/api/bricks',
  routes: [
    // ─── Brick Types ────────────────────────────────────────────────────────────

    /**
     * List all registered brick types (prefetches dynamic-dropdown options)
     */
    route.get({
      path: '/types',
      handler: ({ inject }) => {
        const lifecycle = inject(PluginLifecycle);
        const compiler = inject(ModuleCompiler);
        return Promise.all(
          inject(BrickTypeRegistry)
            .list()
            .map((t) => toBrickTypeDto(t, lifecycle, compiler))
        );
      },
    }),

    /**
     * Get a specific brick type by full ID
     */
    route.get({
      path: '/types/:id',
      params: z.object({
        id: z.string(),
      }),
      handler: ({ params, inject }) => {
        const t = inject(BrickTypeRegistry).get(params.id);
        if (!t) {
          throw new NotFound('Brick type not found');
        }
        return toBrickTypeDto(t, inject(PluginLifecycle), inject(ModuleCompiler));
      },
    }),

    /**
     * Fetch dynamic options for a brick config field via IPC
     */
    route.get({
      path: '/types/:typeId/config/:name/options',
      params: z.object({
        typeId: z.string(),
        name: z.string(),
      }),
      handler: async ({ params, inject }) => {
        const brickType = inject(BrickTypeRegistry).get(params.typeId);
        if (!brickType) {
          return {
            options: [],
          };
        }
        const process = inject(PluginLifecycle).getProcess(brickType.pluginName);
        if (!process) {
          return {
            options: [],
          };
        }
        return {
          options: await process.fetchPreferenceOptions(params.name),
        };
      },
    }),

    // ─── Brick Type Modules ─────────────────────────────────────────────────────
    // Uses pluginUid + brickId to avoid encoded slashes in scoped package names.
    // CSS is inlined into the JS module as a self-injecting <style> tag.

    /**
     * Serve the compiled JS module for a brick type (CSS inlined).
     * URL format: /modules/:pluginUid/:brickId.:hash.js — hash is for cache busting only.
     */
    route.get({
      path: '/modules/:pluginUid/:file',
      params: z.object({
        pluginUid: z.string(),
        file: z.string(),
      }),
      handler: ({ params, inject }) => {
        const pluginName = inject(PluginLifecycle).resolvePluginNameByUid(params.pluginUid);
        if (!pluginName) {
          return new Response('Plugin not found', { status: 404 });
        }
        // Parse brickId from "brickId.hash.js"
        const dotIdx = params.file.indexOf('.');
        const brickId = dotIdx > 0 ? params.file.slice(0, dotIdx) : params.file;
        const entry = inject(ModuleCompiler).get(`${pluginName}:bricks/${brickId}`);
        if (!entry) {
          return new Response('Brick module not found', { status: 404 });
        }
        return new Response(Bun.file(entry.filePath), {
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      },
    }),

    // ─── Brick Instance Actions ─────────────────────────────────────────────────

    /**
     * Send an action to a brick instance
     */
    route.post({
      path: '/instances/:id/action',
      params: z.object({
        id: z.string(),
      }),
      body: z.object({
        brickTypeId: z.string(),
        actionId: z.string(),
        payload: z.unknown().optional(),
      }),
      handler: ({ params, body, inject }) => {
        const brickType = inject(BrickTypeRegistry).get(body.brickTypeId);
        if (!brickType) {
          throw new NotFound('Brick type not found');
        }

        const process = inject(PluginLifecycle).getProcess(brickType.pluginName);
        if (!process) {
          throw new NotFound('Plugin not running');
        }

        process.sendBrickInstanceAction(
          params.id,
          body.brickTypeId,
          body.actionId,
          body.payload as Json
        );
        return {
          ok: true,
        };
      },
    }),
  ],
});
