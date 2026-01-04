import { BadRequest, group, route } from '@brika/router';
import type { Json } from '@brika/shared';
import { z } from 'zod';
import { ToolRegistry } from '@/runtime/tools/tool-registry';

export const toolsRoutes = group('/api/tools', [
  route.get('/', ({ inject }) => {
    return inject(ToolRegistry).list();
  }),

  route.post(
    '/call',
    {
      body: z.object({
        name: z.string(),
        args: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    async ({ body, inject }) => {
      const tools = inject(ToolRegistry);
      const result = await tools.call(body.name, (body.args ?? {}) as Record<string, Json>, {
        traceId: crypto.randomUUID(),
        source: 'api',
      });
      if (!result.ok) {
        throw new BadRequest(result.content);
      }
      return result;
    }
  ),
]);
