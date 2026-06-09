import { JsonRecord } from '@brika/ipc';
import { group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { ToolRegistry } from '@/runtime/tools/tool-registry';

/**
 * Tool registry endpoints. Tools are AI-discoverable plugin capabilities
 * addressed globally by id (the cross-plugin action layer). The workflows UI's
 * fetchTools/fetchToolSchema already target these paths.
 */
export const toolsRoutes = group({
  prefix: '/api/tools',
  routes: [
    route.get({
      path: '/',
      handler: ({ inject }) => inject(ToolRegistry).list(),
    }),

    route.get({
      path: '/:id/schema',
      params: z.object({ id: z.string() }),
      handler: ({ params, inject }) => {
        const tool = inject(ToolRegistry).get(params.id);
        if (!tool) {
          throw new NotFound('Tool not found');
        }
        return tool;
      },
    }),

    route.post({
      path: '/:id/call',
      params: z.object({ id: z.string() }),
      body: JsonRecord.optional(),
      handler: ({ params, body, inject }) =>
        inject(ToolRegistry).call(params.id, body ?? {}, {
          traceId: crypto.randomUUID(),
          source: 'api',
        }),
    }),
  ],
});
