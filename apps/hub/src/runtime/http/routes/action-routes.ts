import type { Json } from '@brika/ipc';
import { group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { getOrThrow } from '../utils/resource-helpers';

const actionParams = z.object({
  uid: z.string(),
  actionId: z.string(),
});

/**
 * Action endpoint for plugin page → plugin process communication.
 * Pages call `callAction(ref, input)` which POSTs here.
 */
export const actionRoutes = group({
  prefix: '/api/plugins',
  routes: [
    route.post({
      path: '/:uid/actions/:actionId',
      params: actionParams,
      body: z.unknown().optional(),
      handler: async ({ params, body, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');
        const process = inject(PluginLifecycle).getProcess(plugin.name);
        if (!process) {
          throw new NotFound('Plugin not running');
        }

        const result = await process.callPluginAction(params.actionId, body as Json | undefined);
        if (!result.ok) {
          return Response.json(
            {
              error: result.error,
            },
            {
              status: 500,
            }
          );
        }
        return Response.json({
          data: result.data,
        });
      },
    }),
  ],
});
