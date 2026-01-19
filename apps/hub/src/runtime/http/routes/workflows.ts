import { BadRequest, createSSEStream, group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { AutomationEngine, WorkflowLoader } from '@/runtime/automations';
import { BlockRegistry } from '@/runtime/blocks';

const blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  config: z.record(z.string(), z.unknown()).optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
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

export const workflowsRoutes = group('/api/workflows', [
  route.get('/', ({ inject }) => {
    return inject(AutomationEngine).list();
  }),

  route.post('/', { body: workflowSchema }, async ({ body, inject }) => {
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
        config: (b.config ?? {}) as Record<string, import('@brika/shared').Json>,
        position: b.position,
      })),
      connections,
    };
    await inject(WorkflowLoader).saveWorkflow(workflow);
    return { ok: true, id: body.id };
  }),

  route.get('/blocks', ({ inject }) => {
    return inject(AutomationEngine).getBlockTypes();
  }),

  // Workflow runs - returns execution history (stub for now)
  route.get('/runs', () => {
    // TODO: Implement run tracking in AutomationEngine
    return [];
  }),

  route.post('/enable', { body: z.object({ id: z.string() }) }, async ({ body, inject }) => {
    return { ok: await inject(AutomationEngine).setEnabled(body.id, true) };
  }),

  route.post('/disable', { body: z.object({ id: z.string() }) }, async ({ body, inject }) => {
    return { ok: await inject(AutomationEngine).setEnabled(body.id, false) };
  }),

  // SSE: Stream ALL workflow runtime events (debug)
  route.get('/debug', ({ inject }) => {
    const automations = inject(AutomationEngine);

    return createSSEStream((send) => {
      // Send initial state - list of running workflows
      const workflows = automations.list().filter((w) => w.enabled && w.startedAt);
      send(
        {
          type: 'init',
          runningWorkflows: workflows.map((w) => ({ id: w.id, startedAt: w.startedAt })),
          timestamp: Date.now(),
        },
        'debug'
      );

      // Subscribe to all workflow events
      const unsub = automations.addGlobalListener((event) => {
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
  }),

  route.get('/:id', { params: z.object({ id: z.string() }) }, ({ params, inject }) => {
    const workflow = inject(AutomationEngine).get(params.id);
    if (!workflow) throw new NotFound('Workflow not found');
    return workflow;
  }),

  route.delete('/:id', { params: z.object({ id: z.string() }) }, async ({ params, inject }) => {
    const ok = await inject(WorkflowLoader).deleteWorkflow(params.id);
    return { ok };
  }),
]);
