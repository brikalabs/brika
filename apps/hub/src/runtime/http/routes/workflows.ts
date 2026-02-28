import { BadRequest, createSSEStream, group, route } from '@brika/router';
import { z } from 'zod';
import { BlockRegistry } from '@/runtime/blocks';
import { WorkflowEngine, WorkflowLoader } from '@/runtime/workflows';
import type { Json } from '@/types';
import { getOrThrow } from '../utils/resource-helpers';

const PositionSchema = z
  .object({ x: z.number(), y: z.number() })
  .transform((pos) => ({ x: Math.round(pos.x), y: Math.round(pos.y) }));

const nonEmptyRecord = <T extends z.ZodTypeAny>(schema: T) =>
  z.optional(schema).transform((val) => (val && Object.keys(val).length > 0 ? val : undefined));

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
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  blocks: z.array(blockSchema),
  connections: z.array(connectionSchema).optional(),
  enabled: z.boolean().optional(),
});

export const workflowsRoutes = group({ prefix: '/api/workflows', routes: [
  route.get({ path: '/', handler: ({ inject }) => {
    return inject(WorkflowEngine).list();
  }}),

  route.post({ path: '/', body: workflowSchema, handler: async ({ body, inject }) => {
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
    return { ok: true, id: body.id };
  }}),

  route.get({ path: '/blocks', handler: ({ inject }) => {
    return inject(WorkflowEngine).getBlockTypes();
  }}),

  route.post({ path: '/enable', body: z.object({ id: z.string() }), handler: async ({ body, inject }) => {
    return { ok: await inject(WorkflowEngine).setEnabled(body.id, true) };
  }}),

  route.post({ path: '/disable', body: z.object({ id: z.string() }), handler: async ({ body, inject }) => {
    return { ok: await inject(WorkflowEngine).setEnabled(body.id, false) };
  }}),

  // SSE: Stream ALL workflow runtime events (debug)
  route.get({ path: '/debug', handler: ({ inject }) => {
    const workflowEngine = inject(WorkflowEngine);

    return createSSEStream((send) => {
      // Send initial state - list of running workflows
      const workflows = workflowEngine.list().filter((w) => w.enabled && w.startedAt);
      send(
        {
          type: 'init',
          runningWorkflows: workflows.map((w) => ({ id: w.id, startedAt: w.startedAt })),
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
  }}),

  route.get({ path: '/:id', params: z.object({ id: z.string() }), handler: ({ params, inject }) => {
    const workflow = getOrThrow(inject(WorkflowEngine).get(params.id), 'Workflow not found');
    return workflow;
  }}),

  route.delete({ path: '/:id', params: z.object({ id: z.string() }), handler: async ({ params, inject }) => {
    const ok = await inject(WorkflowLoader).deleteWorkflow(params.id);
    return { ok };
  }}),
]});
