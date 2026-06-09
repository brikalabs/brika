import { Analytics } from '@brika/analytics';
import { BadRequest, createSSEStream, group, route } from '@brika/router';
import { z } from 'zod';
import { BlockRegistry } from '@/runtime/blocks';
import { RunStore, WorkflowEngine, WorkflowLoader } from '@/runtime/workflows';
import { nonEmptyRecord, PositionSchema } from '@/runtime/workflows/schemas';
import type { Json } from '@/types';
import { getOrThrow } from '../utils/resource-helpers';

/**
 * Workflow id is used to build the on-disk file path (`<dir>/<id>.yaml`), so it
 * must never contain path separators or dots that could escape the data dir.
 * Matches the generated `workflow-<slug>` / UUID forms.
 */
const workflowIdSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/, 'id may only contain letters, digits, "-" and "_"');

const blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  config: nonEmptyRecord(z.record(z.string(), z.unknown())),
  position: PositionSchema.optional(),
});

const connectionSchema = z.object({
  from: z.string(),
  fromPort: z.string().optional(),
  to: z.string(),
  toPort: z.string().optional(),
});

const workflowSchema = z.object({
  id: workflowIdSchema,
  name: z.string(),
  description: z.string().optional(),
  blocks: z.array(blockSchema),
  connections: z.array(connectionSchema).optional(),
  enabled: z.boolean().optional(),
});

export const workflowsRoutes = group({
  prefix: '/api/workflows',
  routes: [
    route.get({
      path: '/',
      handler: ({ inject }) => {
        return inject(WorkflowEngine).list();
      },
    }),

    route.post({
      path: '/',
      body: workflowSchema,
      handler: async ({ body, inject }) => {
        // Validate connections for type compatibility
        const blockRegistry = inject(BlockRegistry);
        const connections = body.connections ?? [];

        if (connections.length > 0) {
          const validation = blockRegistry.validateConnections(body.blocks, connections);
          if (!validation.valid) {
            throw new BadRequest(`Invalid connections: ${validation.errors?.join('; ')}`);
          }
        }

        // Only include known workflow properties (avoid spreading unknown keys)
        const workflow = {
          id: body.id,
          name: body.name,
          description: body.description,
          enabled: body.enabled ?? false,
          blocks: body.blocks.map((b) => ({
            id: b.id,
            type: b.type,
            config: b.config as Record<string, Json> | undefined,
            position: b.position,
          })),
          connections,
        };
        await inject(WorkflowLoader).saveWorkflow(workflow);
        inject(Analytics).capture('workflow.saved', {
          blockCount: workflow.blocks.length,
          connectionCount: connections.length,
          enabled: workflow.enabled,
        });
        return {
          ok: true,
          id: body.id,
        };
      },
    }),

    route.get({
      path: '/blocks',
      handler: ({ inject }) => {
        return inject(WorkflowEngine).getBlockTypes();
      },
    }),

    route.post({
      path: '/enable',
      body: z.object({
        id: z.string(),
      }),
      handler: ({ body, inject }) => {
        const ok = inject(WorkflowEngine).setEnabled(body.id, true);
        if (ok) {
          inject(Analytics).capture('workflow.enabled');
        }
        return { ok };
      },
    }),

    route.post({
      path: '/disable',
      body: z.object({
        id: z.string(),
      }),
      handler: ({ body, inject }) => {
        const ok = inject(WorkflowEngine).setEnabled(body.id, false);
        if (ok) {
          inject(Analytics).capture('workflow.disabled');
        }
        return { ok };
      },
    }),

    // Manually trigger a block on a running workflow (backs the button block).
    route.post({
      path: '/inject',
      body: z.object({ blockId: z.string(), port: z.string() }),
      handler: ({ body, inject }) => {
        const ok = inject(WorkflowEngine).inject(body.blockId, body.port, {});
        return { ok };
      },
    }),

    // SSE: Stream ALL workflow runtime events (debug)
    route.get({
      path: '/debug',
      handler: ({ inject }) => {
        const workflowEngine = inject(WorkflowEngine);

        return createSSEStream((send) => {
          // Send initial state - list of running workflows
          const workflows = workflowEngine.list().filter((w) => w.enabled && w.startedAt);
          send(
            {
              type: 'init',
              runningWorkflows: workflows.map((w) => ({
                id: w.id,
                startedAt: w.startedAt,
              })),
              timestamp: Date.now(),
            },
            'debug'
          );

          // Subscribe to all workflow events
          const unsub = workflowEngine.addGlobalListener((event) => {
            send(
              {
                ...event,
                timestamp: Date.now(),
              },
              'debug'
            );
          });

          return () => unsub();
        });
      },
    }),

    // Run history (recorded execution traces). Declared before "/:id" so the
    // static "/runs" segment matches first, mirroring "/debug" above.
    route.get({
      path: '/runs',
      query: z.object({
        workflowId: z.string().optional(),
        status: z.enum(['running', 'completed', 'error']).optional(),
        limit: z.coerce.number().int().min(1).max(1000).optional(),
        cursor: z.coerce.number().int().optional(),
      }),
      handler: ({ query, inject }) => {
        return inject(RunStore).query({ ...query, order: 'desc' }).runs;
      },
    }),

    route.get({
      path: '/runs/:runId',
      params: z.object({
        runId: z.coerce.number().int(),
      }),
      handler: ({ params, inject }) => {
        return getOrThrow(inject(RunStore).get(params.runId), 'Run not found');
      },
    }),

    route.get({
      path: '/:id',
      params: z.object({
        id: z.string(),
      }),
      handler: ({ params, inject }) => {
        const workflow = getOrThrow(inject(WorkflowEngine).get(params.id), 'Workflow not found');
        return workflow;
      },
    }),

    route.delete({
      path: '/:id',
      params: z.object({
        id: workflowIdSchema,
      }),
      handler: async ({ params, inject }) => {
        const ok = await inject(WorkflowLoader).deleteWorkflow(params.id);
        if (ok) {
          inject(Analytics).capture('workflow.deleted');
        }
        return {
          ok,
        };
      },
    }),
  ],
});
