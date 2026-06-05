import { Analytics } from '@brika/analytics';
import { createSSEStream, group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { BoardLoader, BoardService } from '@/runtime/boards';
import { BrickDataStore } from '@/runtime/bricks';
import { BoardActions, BrickActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
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
        inject(Analytics).capture('board.created', { hasIcon: body.icon !== undefined });
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
        inject(Analytics).capture('board.reordered', { count: body.ids.length });
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
        inject(Analytics).capture('board.updated', {
          renamed: body.name !== undefined,
          iconChanged: body.icon !== undefined,
        });
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
        inject(Analytics).capture('board.deleted', { brickCount: board.bricks.length });
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
        inject(Analytics).capture('board.brick_added', {
          brickTypeId: body.brickTypeId,
          withConfig: body.config !== undefined,
        });
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
        inject(Analytics).capture('board.brick_updated', {
          labelChanged: body.label !== undefined,
          configChanged: body.config !== undefined,
          moved: Boolean(body.position && body.size),
        });
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
        inject(Analytics).capture('board.brick_removed');
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
        inject(Analytics).capture('board.layout_saved', { brickCount: body.layouts.length });
        return {
          ok: true,
        };
      },
    }),

    /**
     * REST: Current brick-data snapshot for a board.
     *
     * Lets a freshly-loaded page hydrate brick data immediately on mount,
     * independent of SSE connect timing. The SSE `brick.dataSnapshot` covers
     * the live-stream path; this covers the (re)load path so a slow-polling
     * plugin (e.g. weather, minutes between pushes) never leaves a card stuck
     * on a bare spinner waiting for the next push.
     */
    route.get({
      path: '/:id/brick-data',
      params: z.object({
        id: z.string(),
      }),
      handler: ({ params, inject }) => {
        const board = inject(BoardLoader).get(params.id);
        if (!board) {
          throw new NotFound('Board not found');
        }
        const entries = collectBrickDataEntries(board.bricks, inject(BrickDataStore));
        inject(Logger).withSource('state').debug('Served REST brick-data snapshot', {
          boardId: params.id,
          entryCount: entries.length,
        });
        return { entries };
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
        const logs = inject(Logger).withSource('state');

        const board = loader.get(params.id);
        if (!board) {
          return new Response('Not found', {
            status: 404,
          });
        }

        return createSSEStream((send) => {
          service.viewerConnected(params.id);

          // Send initial brick data snapshot. Always sent (even when empty) so
          // the client has a deterministic "connected" signal and a single,
          // well-known replay point for the current values.
          const dataEntries = collectBrickDataEntries(board.bricks, brickDataStore);
          send({ type: 'brick.dataSnapshot', payload: { entries: dataEntries } }, 'board');
          logs.debug('Board SSE connected, sent brick-data snapshot', {
            boardId: params.id,
            brickCount: board.bricks.length,
            entryCount: dataEntries.length,
          });

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
                logs.debug('Forwarding live brick-data update to board viewer', {
                  boardId: params.id,
                  brickTypeId,
                });
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
