import { createSSEStream, group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { BoardLoader, BoardService } from '@/runtime/boards';
import { BrickDataStore } from '@/runtime/bricks';
import { BoardActions, BrickActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import type { Json } from '@/types';

const brickPlacementFields = {
  config: z.record(z.string(), z.unknown()).optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  size: z
    .object({
      w: z.number(),
      h: z.number(),
    })
    .optional(),
};

/** Collect the latest brick data for each unique brick type on a board. */
function collectBrickDataEntries(
  bricks: ReadonlyArray<{ brickTypeId: string }>,
  store: BrickDataStore
): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];
  const seen = new Set<string>();
  for (const b of bricks) {
    if (!seen.has(b.brickTypeId)) {
      seen.add(b.brickTypeId);
      const data = store.get(b.brickTypeId);
      if (data !== undefined) {
        entries.push([b.brickTypeId, data]);
      }
    }
  }
  return entries;
}

export const boardsRoutes = group({
  prefix: '/api/boards',
  routes: [
    /**
     * List all boards
     */
    route.get({
      path: '/',
      handler: ({ inject }) => {
        return inject(BoardLoader)
          .list()
          .map((d) => ({
            id: d.id,
            name: d.name,
            icon: d.icon,
            columns: d.columns,
            brickCount: d.bricks.length,
          }));
      },
    }),

    /**
     * Create a new board
     */
    route.post({
      path: '/',
      body: z.object({
        name: z.string(),
        icon: z.optional(z.string()),
      }),
      handler: async ({ body, inject }) => {
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
      },
    }),

    /**
     * Reorder boards (tab drag-and-drop).
     * Must be defined before /:id routes so the router doesn't match "order" as an :id.
     */
    route.put({
      path: '/order',
      body: z.object({
        ids: z.array(z.string()),
      }),
      handler: async ({ body, inject }) => {
        const ok = await inject(BoardLoader).reorder(body.ids);
        if (!ok) {
          throw new NotFound('One or more board IDs not found');
        }
        return {
          ok: true,
        };
      },
    }),

    /**
     * Get a specific board with all placements
     */
    route.get({
      path: '/:id',
      params: z.object({
        id: z.string(),
      }),
      handler: ({ params, inject }) => {
        const board = inject(BoardLoader).get(params.id);
        if (!board) {
          throw new NotFound('Board not found');
        }
        return board;
      },
    }),

    /**
     * Update board metadata
     */
    route.put({
      path: '/:id',
      params: z.object({
        id: z.string(),
      }),
      body: z.object({
        name: z.optional(z.string()),
        icon: z.optional(z.string()),
      }),
      handler: async ({ params, body, inject }) => {
        const loader = inject(BoardLoader);
        const board = loader.get(params.id);
        if (!board) {
          throw new NotFound('Board not found');
        }

        if (body.name !== undefined) {
          board.name = body.name;
        }
        if (body.icon !== undefined) {
          board.icon = body.icon;
        }

        await loader.saveBoard(board);
        return board;
      },
    }),

    /**
     * Delete a board
     */
    route.delete({
      path: '/:id',
      params: z.object({
        id: z.string(),
      }),
      handler: async ({ params, inject }) => {
        const loader = inject(BoardLoader);

        const board = loader.get(params.id);
        if (!board) {
          throw new NotFound('Board not found');
        }

        const deleted = await loader.deleteBoard(params.id);
        if (!deleted) {
          throw new NotFound('Board not found');
        }
        return {
          ok: true,
        };
      },
    }),

    /**
     * Add a brick to a board
     */
    route.post({
      path: '/:id/bricks',
      params: z.object({
        id: z.string(),
      }),
      body: z.object({
        brickTypeId: z.string(),
        ...brickPlacementFields,
      }),
      handler: async ({ params, body, inject }) => {
        const placement = await inject(BoardService).addBrick(
          params.id,
          body.brickTypeId,
          (body.config ?? {}) as Record<string, Json>,
          body.position,
          body.size
        );
        if (!placement) {
          throw new NotFound('Board or brick type not found');
        }
        return placement;
      },
    }),

    /**
     * Update a brick placement (label, config, position, size)
     */
    route.put({
      path: '/:id/bricks/:instanceId',
      params: z.object({
        id: z.string(),
        instanceId: z.string(),
      }),
      body: z.object({
        label: z.string().optional(),
        ...brickPlacementFields,
      }),
      handler: async ({ params, body, inject }) => {
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
        return {
          ok: true,
        };
      },
    }),

    /**
     * Remove a brick from a board
     */
    route.delete({
      path: '/:id/bricks/:instanceId',
      params: z.object({
        id: z.string(),
        instanceId: z.string(),
      }),
      handler: async ({ params, inject }) => {
        const removed = await inject(BoardService).removeBrick(params.id, params.instanceId);
        if (!removed) {
          throw new NotFound('Brick not found on board');
        }
        return {
          ok: true,
        };
      },
    }),

    /**
     * Batch update layout after drag-and-drop
     */
    route.put({
      path: '/:id/layout',
      params: z.object({
        id: z.string(),
      }),
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
      handler: async ({ params, body, inject }) => {
        const updated = await inject(BoardService).batchUpdateLayout(params.id, body.layouts);
        if (!updated) {
          throw new NotFound('Board not found');
        }
        return {
          ok: true,
        };
      },
    }),

    /**
     * SSE: Per-board event stream.
     * Tracks viewer connections and streams brick data + board layout events.
     */
    route.get({
      path: '/:id/sse',
      params: z.object({
        id: z.string(),
      }),
      handler: ({ params, inject }) => {
        const service = inject(BoardService);
        const events = inject(EventSystem);
        const loader = inject(BoardLoader);
        const brickDataStore = inject(BrickDataStore);

        const board = loader.get(params.id);
        if (!board) {
          return new Response('Not found', {
            status: 404,
          });
        }

        return createSSEStream((send) => {
          service.viewerConnected(params.id);

          // Send initial brick data snapshot
          const dataEntries = collectBrickDataEntries(board.bricks, brickDataStore);
          if (dataEntries.length > 0) {
            send({ type: 'brick.dataSnapshot', payload: { entries: dataEntries } }, 'board');
          }

          /** Re-read the board so SSE callbacks see bricks added/removed after connect. */
          const currentBoard = () => loader.get(params.id);

          const forward = (type: string, payload: Json) =>
            send(
              {
                type,
                payload,
                ts: Date.now(),
              },
              'board'
            );

          // Typed brick event subscriptions
          const unsubs = [
            events.subscribe(BrickActions.dataUpdated, (action) => {
              // Check if any board brick uses this type
              const brickTypeId = action.payload.brickTypeId;
              if (currentBoard()?.bricks.some((b) => b.brickTypeId === brickTypeId)) {
                forward(action.type, action.payload as unknown as Json);
              }
            }),
            events.subscribe(BrickActions.moduleRecompiled, (action) => {
              if (
                currentBoard()?.bricks.some((b) => b.brickTypeId === action.payload.brickTypeId)
              ) {
                forward(action.type, action.payload as unknown as Json);
              }
            }),

            // Board events filtered by ID
            events.subscribe(BoardActions.brickAdded, (action) => {
              if (action.payload.boardId === params.id) {
                forward(action.type, action.payload as unknown as Json);
              }
            }),
            events.subscribe(BoardActions.brickRemoved, (action) => {
              if (action.payload.boardId === params.id) {
                forward(action.type, action.payload as unknown as Json);
              }
            }),
            events.subscribe(BoardActions.layoutChanged, (action) => {
              if (action.payload.boardId === params.id) {
                forward(action.type, action.payload as unknown as Json);
              }
            }),
            events.subscribe(BoardActions.brickLabelChanged, (action) => {
              if (action.payload.boardId === params.id) {
                forward(action.type, action.payload as unknown as Json);
              }
            }),
            events.subscribe(BoardActions.brickConfigChanged, (action) => {
              if (action.payload.boardId === params.id) {
                forward(action.type, action.payload as unknown as Json);
              }
            }),
          ];

          return () => {
            for (const unsub of unsubs) {
              unsub();
            }
            service.viewerDisconnected(params.id);
          };
        });
      },
    }),
  ],
});
