import { createSSEStream, group, NotFound, route } from '@brika/router';
import type { Json } from '@brika/shared';
import { z } from 'zod';
import { BrickInstanceManager } from '@/runtime/bricks';
import { BoardLoader, BoardService } from '@/runtime/boards';
import { BoardActions, BrickActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';

export const boardsRoutes = group('/api/boards', [
  /**
   * List all boards
   */
  route.get('/', ({ inject }) => {
    return inject(BoardLoader)
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
   * Create a new board
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
      const loader = inject(BoardLoader);
      const id = `board-${Date.now().toString(36)}`;
      const board = {
        id,
        name: body.name,
        icon: body.icon,
        columns: 12,
        bricks: [],
      };
      await loader.saveBoard(board);
      return board;
    }
  ),

  /**
   * Reorder boards (tab drag-and-drop).
   * Must be defined before /:id routes so the router doesn't match "order" as an :id.
   */
  route.put(
    '/order',
    {
      body: z.object({ ids: z.array(z.string()) }),
    },
    async ({ body, inject }) => {
      const ok = await inject(BoardLoader).reorder(body.ids);
      if (!ok) throw new NotFound('One or more board IDs not found');
      return { ok: true };
    }
  ),

  /**
   * Get a specific board with all placements
   */
  route.get('/:id', { params: z.object({ id: z.string() }) }, ({ params, inject }) => {
    const board = inject(BoardLoader).get(params.id);
    if (!board) throw new NotFound('Board not found');
    return board;
  }),

  /**
   * Update board metadata
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
      const loader = inject(BoardLoader);
      const board = loader.get(params.id);
      if (!board) throw new NotFound('Board not found');

      if (body.name !== undefined) board.name = body.name;
      if (body.icon !== undefined) board.icon = body.icon;

      await loader.saveBoard(board);
      return board;
    }
  ),

  /**
   * Delete a board
   */
  route.delete('/:id', { params: z.object({ id: z.string() }) }, async ({ params, inject }) => {
    const service = inject(BoardService);
    const loader = inject(BoardLoader);

    const board = loader.get(params.id);
    if (!board) throw new NotFound('Board not found');

    // Unmount all brick instances
    service.unmountBoard(board);

    const deleted = await loader.deleteBoard(params.id);
    if (!deleted) throw new NotFound('Board not found');
    return { ok: true };
  }),

  /**
   * Add a brick to a board
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
      const placement = await inject(BoardService).addBrick(
        params.id,
        body.brickTypeId,
        (body.config ?? {}) as Record<string, Json>,
        body.position,
        body.size
      );
      if (!placement) throw new NotFound('Board or brick type not found');
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
      const service = inject(BoardService);

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
   * Remove a brick from a board
   */
  route.delete(
    '/:id/bricks/:instanceId',
    { params: z.object({ id: z.string(), instanceId: z.string() }) },
    async ({ params, inject }) => {
      const removed = await inject(BoardService).removeBrick(params.id, params.instanceId);
      if (!removed) throw new NotFound('Brick not found on board');
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
      const updated = await inject(BoardService).batchUpdateLayout(params.id, body.layouts);
      if (!updated) throw new NotFound('Board not found');
      return { ok: true };
    }
  ),

  /**
   * SSE: Per-board event stream.
   * Mounts brick instances on connect, unmounts on disconnect.
   * Sends snapshot + incremental brick and board events.
   */
  route.get('/:id/sse', { params: z.object({ id: z.string() }) }, ({ params, inject }) => {
    const service = inject(BoardService);
    const events = inject(EventSystem);
    const instances = inject(BrickInstanceManager);
    const loader = inject(BoardLoader);

    const board = loader.get(params.id);
    if (!board) return new Response('Not found', { status: 404 });

    return createSSEStream((send) => {
      service.viewerConnected(params.id);

      // Track which instances belong to this board
      const instanceIds = new Set(board.bricks.map((b) => b.instanceId));

      // Send snapshot of current bodies for this board's instances
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
      send({ type: 'brick.snapshot', payload: { instances: snapshot } }, 'board');

      const forward = (type: string, payload: Json) =>
        send({ type, payload, ts: Date.now() }, 'board');

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

        // Board events filtered by ID
        events.subscribe(BoardActions.brickAdded, (action) => {
          if (action.payload.boardId !== params.id) return;
          instanceIds.add(action.payload.instanceId);
          forward(action.type, action.payload as unknown as Json);
        }),
        events.subscribe(BoardActions.brickRemoved, (action) => {
          if (action.payload.boardId !== params.id) return;
          instanceIds.delete(action.payload.instanceId);
          forward(action.type, action.payload as unknown as Json);
        }),
        events.subscribe(BoardActions.layoutChanged, (action) => {
          if (action.payload.boardId === params.id)
            forward(action.type, action.payload as unknown as Json);
        }),
        events.subscribe(BoardActions.brickLabelChanged, (action) => {
          if (action.payload.boardId === params.id)
            forward(action.type, action.payload as unknown as Json);
        }),
        events.subscribe(BoardActions.brickConfigChanged, (action) => {
          if (action.payload.boardId === params.id)
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
