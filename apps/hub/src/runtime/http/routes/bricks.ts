import { Analytics } from '@brika/analytics';
import { group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { BrickTypeRegistry } from '@/runtime/bricks';
import type { RegisteredBrickType } from '@/runtime/bricks/brick-type-registry';
import { ModuleCompiler } from '@/runtime/modules';
import { MODULE_KINDS, resolveModuleUrl } from '@/runtime/modules/module-kinds';
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
  const moduleUrl = pluginUid
    ? resolveModuleUrl(compiler, t.pluginName, pluginUid, MODULE_KINDS.brick, t.localId)
    : undefined;

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

    // Brick view modules are served by the generic /api/modules route.

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
        inject(Analytics).capture('brick.instance_action_invoked', {
          brickTypeId: body.brickTypeId,
          actionId: body.actionId,
        });
        return {
          ok: true,
        };
      },
    }),
  ],
});
