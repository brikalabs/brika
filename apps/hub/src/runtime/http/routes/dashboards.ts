import { createSSEStream, group, NotFound, route } from '@brika/router';
import type { Json } from '@brika/shared';
import { z } from 'zod';
import { BrickInstanceManager } from '@/runtime/bricks';
import { DashboardLoader, DashboardService } from '@/runtime/dashboards';
import { BrickActions, DashboardActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';

export const dashboardsRoutes = group('/api/dashboards', [
  /**
   * List all dashboards
   */
  route.get('/', ({ inject }) => {
    return inject(DashboardLoader)
      .list()
      .map((d) => ({
        id: d.id,
        name: d.name,
        icon: d.icon,
        columns: d.columns,
        brickCount: d.bricks.length,
      }));
  }),

  /**
   * Create a new dashboard
   */
  route.post(
    '/',
    {
      body: z.object({
        name: z.string(),
        icon: z.optional(z.string()),
      }),
    },
    async ({ body, inject }) => {
      const loader = inject(DashboardLoader);
      const id = `dashboard-${Date.now().toString(36)}`;
      const dashboard = {
        id,
        name: body.name,
        icon: body.icon,
        columns: 12,
        bricks: [],
      };
      await loader.saveDashboard(dashboard);
      return dashboard;
    }
  ),

  /**
   * Get a specific dashboard with all placements
   */
  route.get('/:id', { params: z.object({ id: z.string() }) }, ({ params, inject }) => {
    const dashboard = inject(DashboardLoader).get(params.id);
    if (!dashboard) throw new NotFound('Dashboard not found');
    return dashboard;
  }),

  /**
   * Update dashboard metadata
   */
  route.put(
    '/:id',
    {
      params: z.object({ id: z.string() }),
      body: z.object({
        name: z.optional(z.string()),
        icon: z.optional(z.string()),
      }),
    },
    async ({ params, body, inject }) => {
      const loader = inject(DashboardLoader);
      const dashboard = loader.get(params.id);
      if (!dashboard) throw new NotFound('Dashboard not found');

      if (body.name !== undefined) dashboard.name = body.name;
      if (body.icon !== undefined) dashboard.icon = body.icon;

      await loader.saveDashboard(dashboard);
      return dashboard;
    }
  ),

  /**
   * Delete a dashboard
   */
  route.delete('/:id', { params: z.object({ id: z.string() }) }, async ({ params, inject }) => {
    const service = inject(DashboardService);
    const loader = inject(DashboardLoader);

    const dashboard = loader.get(params.id);
    if (!dashboard) throw new NotFound('Dashboard not found');

    // Unmount all brick instances
    service.unmountDashboard(dashboard);

    const deleted = await loader.deleteDashboard(params.id);
    if (!deleted) throw new NotFound('Dashboard not found');
    return { ok: true };
  }),

  /**
   * Add a brick to a dashboard
   */
  route.post(
    '/:id/bricks',
    {
      params: z.object({ id: z.string() }),
      body: z.object({
        brickTypeId: z.string(),
        config: z.record(z.string(), z.unknown()).optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        size: z.object({ w: z.number(), h: z.number() }).optional(),
      }),
    },
    async ({ params, body, inject }) => {
      const placement = await inject(DashboardService).addBrick(
        params.id,
        body.brickTypeId,
        (body.config ?? {}) as Record<string, Json>,
        body.position,
        body.size
      );
      if (!placement) throw new NotFound('Dashboard or brick type not found');
      return placement;
    }
  ),

  /**
   * Update a brick placement (label, config, position, size)
   */
  route.put(
    '/:id/bricks/:instanceId',
    {
      params: z.object({ id: z.string(), instanceId: z.string() }),
      body: z.object({
        label: z.string().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        size: z.object({ w: z.number(), h: z.number() }).optional(),
      }),
    },
    async ({ params, body, inject }) => {
      const service = inject(DashboardService);

      if (body.label !== undefined) {
        await service.updateBrickLabel(params.id, params.instanceId, body.label || undefined);
      }
      if (body.config) {
        await service.updateBrickConfig(
          params.id,
          params.instanceId,
          body.config as Record<string, Json>
        );
      }
      if (body.position && body.size) {
        await service.moveBrick(params.id, params.instanceId, body.position, body.size);
      }
      return { ok: true };
    }
  ),

  /**
   * Remove a brick from a dashboard
   */
  route.delete(
    '/:id/bricks/:instanceId',
    { params: z.object({ id: z.string(), instanceId: z.string() }) },
    async ({ params, inject }) => {
      const removed = await inject(DashboardService).removeBrick(params.id, params.instanceId);
      if (!removed) throw new NotFound('Brick not found on dashboard');
      return { ok: true };
    }
  ),

  /**
   * Batch update layout after drag-and-drop
   */
  route.put(
    '/:id/layout',
    {
      params: z.object({ id: z.string() }),
      body: z.object({
        layouts: z.array(
          z.object({
            instanceId: z.string(),
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
          })
        ),
      }),
    },
    async ({ params, body, inject }) => {
      const updated = await inject(DashboardService).batchUpdateLayout(params.id, body.layouts);
      if (!updated) throw new NotFound('Dashboard not found');
      return { ok: true };
    }
  ),

  /**
   * SSE: Per-dashboard event stream.
   * Mounts brick instances on connect, unmounts on disconnect.
   * Sends snapshot + incremental brick and dashboard events.
   */
  route.get('/:id/sse', { params: z.object({ id: z.string() }) }, ({ params, inject }) => {
    const service = inject(DashboardService);
    const events = inject(EventSystem);
    const instances = inject(BrickInstanceManager);
    const loader = inject(DashboardLoader);

    const dashboard = loader.get(params.id);
    if (!dashboard) return new Response('Not found', { status: 404 });

    return createSSEStream((send) => {
      service.viewerConnected(params.id);

      // Track which instances belong to this dashboard
      const instanceIds = new Set(dashboard.bricks.map((b) => b.instanceId));

      // Send snapshot of current bodies for this dashboard's instances
      const snapshot: Array<{ instanceId: string; brickTypeId: string; body: unknown[] }> = [];
      for (const id of instanceIds) {
        const inst = instances.get(id);
        if (inst)
          snapshot.push({
            instanceId: inst.instanceId,
            brickTypeId: inst.brickTypeId,
            body: inst.body,
          });
      }
      send({ type: 'brick.snapshot', payload: { instances: snapshot } }, 'dashboard');

      const forward = (type: string, payload: Json) =>
        send({ type, payload, ts: Date.now() }, 'dashboard');

      // Typed brick event subscriptions (O(1) matching instead of glob regex)
      const unsubs = [
        events.subscribe(BrickActions.instancePatched, (action) => {
          if (instanceIds.has(action.payload.instanceId))
            forward(action.type, action.payload as unknown as Json);
        }),
        events.subscribe(BrickActions.instanceMounted, (action) => {
          if (instanceIds.has(action.payload.instanceId))
            forward(action.type, action.payload as unknown as Json);
        }),
        events.subscribe(BrickActions.pluginDisconnected, (action) => {
          const matching = action.payload.instanceIds.filter((id) => instanceIds.has(id));
          if (matching.length > 0)
            forward(action.type, { ...action.payload, instanceIds: matching } as unknown as Json);
        }),

        // Dashboard events filtered by ID
        events.subscribe(DashboardActions.brickAdded, (action) => {
          if (action.payload.dashboardId !== params.id) return;
          instanceIds.add(action.payload.instanceId);
          forward(action.type, action.payload as unknown as Json);
        }),
        events.subscribe(DashboardActions.brickRemoved, (action) => {
          if (action.payload.dashboardId !== params.id) return;
          instanceIds.delete(action.payload.instanceId);
          forward(action.type, action.payload as unknown as Json);
        }),
        events.subscribe(DashboardActions.layoutChanged, (action) => {
          if (action.payload.dashboardId === params.id)
            forward(action.type, action.payload as unknown as Json);
        }),
        events.subscribe(DashboardActions.brickLabelChanged, (action) => {
          if (action.payload.dashboardId === params.id)
            forward(action.type, action.payload as unknown as Json);
        }),
        events.subscribe(DashboardActions.brickConfigChanged, (action) => {
          if (action.payload.dashboardId === params.id)
            forward(action.type, action.payload as unknown as Json);
        }),
      ];

      return () => {
        for (const unsub of unsubs) unsub();
        service.viewerDisconnected(params.id);
      };
    });
  }),
]);
