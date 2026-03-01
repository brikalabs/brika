/**
 * Tests for board routes (/api/boards)
 */
import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import type { Board, BoardBrickPlacement } from '@/runtime/boards';
import { BoardLoader, BoardService } from '@/runtime/boards';
import { BrickInstanceManager } from '@/runtime/bricks';
import { EventSystem } from '@/runtime/events/event-system';
import { boardsRoutes } from '@/runtime/http/routes/boards';

function makePlacement(overrides?: Partial<BoardBrickPlacement>): BoardBrickPlacement {
  return {
    instanceId: 'inst-1',
    brickTypeId: 'timer:clock',
    config: {},
    position: {
      x: 0,
      y: 0,
    },
    size: {
      w: 3,
      h: 2,
    },
    ...overrides,
  };
}

function makeBoard(overrides?: Partial<Board>): Board {
  return {
    id: 'board-1',
    name: 'Home',
    icon: 'house',
    columns: 12,
    bricks: [
      makePlacement(),
    ],
    ...overrides,
  };
}

describe('boards routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockLoader: {
    list: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
    saveBoard: ReturnType<typeof mock>;
    deleteBoard: ReturnType<typeof mock>;
    reorder: ReturnType<typeof mock>;
  };
  let mockService: {
    addBrick: ReturnType<typeof mock>;
    removeBrick: ReturnType<typeof mock>;
    updateBrickLabel: ReturnType<typeof mock>;
    updateBrickConfig: ReturnType<typeof mock>;
    moveBrick: ReturnType<typeof mock>;
    batchUpdateLayout: ReturnType<typeof mock>;
    unmountBoard: ReturnType<typeof mock>;
    viewerConnected: ReturnType<typeof mock>;
    viewerDisconnected: ReturnType<typeof mock>;
  };
  let mockInstances: {
    get: ReturnType<typeof mock>;
    list: ReturnType<typeof mock>;
  };
  let mockEvents: {
    subscribe: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    const board = makeBoard();
    mockLoader = {
      list: mock().mockReturnValue([
        board,
      ]),
      get: mock().mockReturnValue(board),
      saveBoard: mock().mockResolvedValue(undefined),
      deleteBoard: mock().mockResolvedValue(true),
      reorder: mock().mockResolvedValue(true),
    };
    mockService = {
      addBrick: mock().mockResolvedValue({
        instanceId: 'new-1',
        brickTypeId: 'timer:clock',
      }),
      removeBrick: mock().mockResolvedValue(true),
      updateBrickLabel: mock().mockResolvedValue(undefined),
      updateBrickConfig: mock().mockResolvedValue(undefined),
      moveBrick: mock().mockResolvedValue(undefined),
      batchUpdateLayout: mock().mockResolvedValue(true),
      unmountBoard: mock(),
      viewerConnected: mock(),
      viewerDisconnected: mock(),
    };
    mockInstances = {
      get: mock().mockReturnValue(null),
      list: mock().mockReturnValue([]),
    };
    mockEvents = {
      subscribe: mock().mockReturnValue(() => {}),
    };
    stub(BoardLoader, mockLoader);
    stub(BoardService, mockService);
    stub(EventSystem, mockEvents);
    stub(BrickInstanceManager, mockInstances);
    app = TestApp.create(boardsRoutes);
  });

  // ─── List ──────────────────────────────────────────────────────────────────

  test('GET /api/boards returns summary list', async () => {
    const res =
      await app.get<
        Array<{
          id: string;
          name: string;
          brickCount: number;
        }>
      >('/api/boards');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('board-1');
    expect(res.body[0].name).toBe('Home');
    expect(res.body[0].brickCount).toBe(1);
  });

  test('GET /api/boards returns icon and columns in summary', async () => {
    const res =
      await app.get<
        Array<{
          icon: string;
          columns: number;
        }>
      >('/api/boards');

    expect(res.status).toBe(200);
    expect(res.body[0].icon).toBe('house');
    expect(res.body[0].columns).toBe(12);
  });

  // ─── Create ────────────────────────────────────────────────────────────────

  test('POST /api/boards creates a new board', async () => {
    const res = await app.post('/api/boards', {
      name: 'Dashboard',
    });

    expect(res.status).toBe(200);
    expect(mockLoader.saveBoard).toHaveBeenCalledTimes(1);
  });

  test('POST /api/boards creates board with icon', async () => {
    const res = await app.post<{
      name: string;
      icon: string;
    }>('/api/boards', {
      name: 'Stats',
      icon: 'chart',
    });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Stats');
    expect(res.body.icon).toBe('chart');
  });

  test('POST /api/boards validates body', async () => {
    const res = await app.post('/api/boards', {});

    expect(res.status).toBe(400);
  });

  // ─── Reorder ───────────────────────────────────────────────────────────────

  test('PUT /api/boards/order reorders boards', async () => {
    const res = await app.put('/api/boards/order', {
      ids: [
        'board-1',
        'board-2',
      ],
    });

    expect(res.status).toBe(200);
    expect(mockLoader.reorder).toHaveBeenCalledWith([
      'board-1',
      'board-2',
    ]);
  });

  test('PUT /api/boards/order returns 404 for invalid IDs', async () => {
    mockLoader.reorder.mockResolvedValue(false);

    const res = await app.put('/api/boards/order', {
      ids: [
        'missing',
      ],
    });

    expect(res.status).toBe(404);
  });

  // ─── Get ───────────────────────────────────────────────────────────────────

  test('GET /api/boards/:id calls loader with correct id', async () => {
    const res = await app.get('/api/boards/board-1');

    expect(res.status).toBe(200);
    expect(mockLoader.get).toHaveBeenCalledWith('board-1');
  });

  test('GET /api/boards/:id returns 404 for unknown board', async () => {
    mockLoader.get.mockReturnValue(undefined);

    const res = await app.get('/api/boards/missing');

    expect(res.status).toBe(404);
  });

  // ─── Update ────────────────────────────────────────────────────────────────

  test('PUT /api/boards/:id updates name only', async () => {
    const res = await app.put('/api/boards/board-1', {
      name: 'Updated',
    });

    expect(res.status).toBe(200);
    expect(mockLoader.saveBoard).toHaveBeenCalledTimes(1);
  });

  test('PUT /api/boards/:id updates icon only', async () => {
    const res = await app.put('/api/boards/board-1', {
      icon: 'star',
    });

    expect(res.status).toBe(200);
    expect(mockLoader.saveBoard).toHaveBeenCalledTimes(1);
  });

  test('PUT /api/boards/:id updates both name and icon', async () => {
    const res = await app.put('/api/boards/board-1', {
      name: 'New',
      icon: 'rocket',
    });

    expect(res.status).toBe(200);
    expect(mockLoader.saveBoard).toHaveBeenCalledTimes(1);
  });

  test('PUT /api/boards/:id returns 404 for unknown board', async () => {
    mockLoader.get.mockReturnValue(undefined);

    const res = await app.put('/api/boards/missing', {
      name: 'X',
    });

    expect(res.status).toBe(404);
  });

  // ─── Delete ────────────────────────────────────────────────────────────────

  test('DELETE /api/boards/:id deletes board', async () => {
    const res = await app.delete('/api/boards/board-1');

    expect(res.status).toBe(200);
    expect(mockService.unmountBoard).toHaveBeenCalled();
    expect(mockLoader.deleteBoard).toHaveBeenCalledWith('board-1');
  });

  test('DELETE /api/boards/:id returns 404 for unknown board', async () => {
    mockLoader.get.mockReturnValue(undefined);

    const res = await app.delete('/api/boards/missing');

    expect(res.status).toBe(404);
  });

  test('DELETE /api/boards/:id returns 404 when deleteBoard returns false', async () => {
    mockLoader.deleteBoard.mockResolvedValue(false);

    const res = await app.delete('/api/boards/board-1');

    expect(res.status).toBe(404);
  });

  // ─── Add brick ─────────────────────────────────────────────────────────────

  test('POST /api/boards/:id/bricks adds a brick', async () => {
    const res = await app.post('/api/boards/board-1/bricks', {
      brickTypeId: 'timer:clock',
      config: {
        interval: 1000,
      },
      position: {
        x: 0,
        y: 0,
      },
      size: {
        w: 3,
        h: 2,
      },
    });

    expect(res.status).toBe(200);
    expect(mockService.addBrick).toHaveBeenCalled();
  });

  test('POST /api/boards/:id/bricks without optional fields passes defaults', async () => {
    const res = await app.post('/api/boards/board-1/bricks', {
      brickTypeId: 'timer:clock',
    });

    expect(res.status).toBe(200);
    // config defaults to {} when not provided, position and size are undefined
    const call = mockService.addBrick.mock.calls[0];
    expect(call[0]).toBe('board-1');
    expect(call[1]).toBe('timer:clock');
    expect(call[2]).toEqual({});
    expect(call[3]).toBeUndefined();
    expect(call[4]).toBeUndefined();
  });

  test('POST /api/boards/:id/bricks returns 404 when board or type missing', async () => {
    mockService.addBrick.mockResolvedValue(null);

    const res = await app.post('/api/boards/board-1/bricks', {
      brickTypeId: 'missing:type',
    });

    expect(res.status).toBe(404);
  });

  // ─── Update brick ──────────────────────────────────────────────────────────

  test('PUT /api/boards/:id/bricks/:instanceId updates label, config, and position', async () => {
    const res = await app.put('/api/boards/board-1/bricks/inst-1', {
      label: 'My Clock',
      config: {
        interval: 500,
      },
      position: {
        x: 1,
        y: 2,
      },
      size: {
        w: 4,
        h: 3,
      },
    });

    expect(res.status).toBe(200);
    expect(mockService.updateBrickLabel).toHaveBeenCalledWith('board-1', 'inst-1', 'My Clock');
    expect(mockService.updateBrickConfig).toHaveBeenCalled();
    expect(mockService.moveBrick).toHaveBeenCalled();
  });

  test('PUT /api/boards/:id/bricks/:instanceId with empty label passes undefined', async () => {
    const res = await app.put('/api/boards/board-1/bricks/inst-1', {
      label: '',
    });

    expect(res.status).toBe(200);
    // empty string is falsy so `body.label || undefined` yields undefined
    expect(mockService.updateBrickLabel).toHaveBeenCalledWith('board-1', 'inst-1', undefined);
  });

  test('PUT /api/boards/:id/bricks/:instanceId with only config skips label and move', async () => {
    const res = await app.put('/api/boards/board-1/bricks/inst-1', {
      config: {
        theme: 'dark',
      },
    });

    expect(res.status).toBe(200);
    expect(mockService.updateBrickLabel).not.toHaveBeenCalled();
    expect(mockService.updateBrickConfig).toHaveBeenCalled();
    expect(mockService.moveBrick).not.toHaveBeenCalled();
  });

  test('PUT /api/boards/:id/bricks/:instanceId with only position (no size) skips move', async () => {
    const res = await app.put('/api/boards/board-1/bricks/inst-1', {
      position: {
        x: 5,
        y: 5,
      },
    });

    expect(res.status).toBe(200);
    // moveBrick requires BOTH position and size
    expect(mockService.moveBrick).not.toHaveBeenCalled();
  });

  test('PUT /api/boards/:id/bricks/:instanceId with only size (no position) skips move', async () => {
    const res = await app.put('/api/boards/board-1/bricks/inst-1', {
      size: {
        w: 6,
        h: 4,
      },
    });

    expect(res.status).toBe(200);
    expect(mockService.moveBrick).not.toHaveBeenCalled();
  });

  test('PUT /api/boards/:id/bricks/:instanceId with empty body returns ok', async () => {
    const res = await app.put('/api/boards/board-1/bricks/inst-1', {});

    expect(res.status).toBe(200);
    expect(mockService.updateBrickLabel).not.toHaveBeenCalled();
    expect(mockService.updateBrickConfig).not.toHaveBeenCalled();
    expect(mockService.moveBrick).not.toHaveBeenCalled();
  });

  // ─── Remove brick ──────────────────────────────────────────────────────────

  test('DELETE /api/boards/:id/bricks/:instanceId removes brick', async () => {
    const res = await app.delete('/api/boards/board-1/bricks/inst-1');

    expect(res.status).toBe(200);
    expect(mockService.removeBrick).toHaveBeenCalledWith('board-1', 'inst-1');
  });

  test('DELETE /api/boards/:id/bricks/:instanceId returns 404 when not found', async () => {
    mockService.removeBrick.mockResolvedValue(false);

    const res = await app.delete('/api/boards/board-1/bricks/inst-1');

    expect(res.status).toBe(404);
  });

  // ─── Layout ────────────────────────────────────────────────────────────────

  test('PUT /api/boards/:id/layout batch updates layout', async () => {
    const layouts = [
      {
        instanceId: 'inst-1',
        x: 0,
        y: 0,
        w: 6,
        h: 4,
      },
    ];

    const res = await app.put('/api/boards/board-1/layout', {
      layouts,
    });

    expect(res.status).toBe(200);
    expect(mockService.batchUpdateLayout).toHaveBeenCalledWith('board-1', layouts);
  });

  test('PUT /api/boards/:id/layout returns 404 for unknown board', async () => {
    mockService.batchUpdateLayout.mockResolvedValue(false);

    const res = await app.put('/api/boards/board-1/layout', {
      layouts: [
        {
          instanceId: 'inst-1',
          x: 0,
          y: 0,
          w: 6,
          h: 4,
        },
      ],
    });

    expect(res.status).toBe(404);
  });

  // ─── SSE ───────────────────────────────────────────────────────────────────

  test('GET /api/boards/:id/sse returns 404 when board not found', async () => {
    mockLoader.get.mockReturnValue(undefined);

    const raw = await app.hono.fetch(new Request('http://test/api/boards/missing/sse'));

    expect(raw.status).toBe(404);
    const text = await raw.text();
    expect(text).toBe('Not found');
  });

  test('GET /api/boards/:id/sse returns SSE stream with snapshot', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
        makePlacement({
          instanceId: 'inst-2',
          brickTypeId: 'weather:card',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    // Return real instance data for inst-1, null for inst-2
    mockInstances.get.mockImplementation((id: string) => {
      if (id === 'inst-1') {
        return {
          instanceId: 'inst-1',
          brickTypeId: 'timer:clock',
          body: [
            {
              type: 'text',
              props: {
                value: 'Hello',
              },
            },
          ],
        };
      }
      return null;
    });

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));

    expect(raw.status).toBe(200);
    expect(raw.headers.get('Content-Type')).toBe('text/event-stream');

    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }

    const { value } = await reader.read();
    await reader.cancel();

    const text = new TextDecoder().decode(value);
    // Snapshot event should contain the instance that was found
    expect(text).toContain('event: board');
    expect(text).toContain('brick.snapshot');
    expect(text).toContain('inst-1');

    // viewerConnected should be called
    expect(mockService.viewerConnected).toHaveBeenCalledWith('board-1');
  });

  test('GET /api/boards/:id/sse calls viewerDisconnected on stream cancel', async () => {
    const board = makeBoard({
      bricks: [],
    });
    mockLoader.get.mockReturnValue(board);

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));

    expect(raw.status).toBe(200);

    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    // Read the snapshot event
    await reader.read();
    // Cancel the stream to trigger cleanup
    await reader.cancel();

    expect(mockService.viewerDisconnected).toHaveBeenCalledWith('board-1');
  });

  test('GET /api/boards/:id/sse subscribes to brick and board events', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    expect(raw.status).toBe(200);

    // EventSystem.subscribe should have been called for each event type
    // BrickActions: instancePatched, instanceMounted, pluginDisconnected
    // BoardActions: brickAdded, brickRemoved, layoutChanged, brickLabelChanged, brickConfigChanged
    expect(mockEvents.subscribe.mock.calls.length).toBe(8);

    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();
    await reader.cancel();
  });

  test('GET /api/boards/:id/sse forwards matching instancePatched events', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    // Capture subscription callbacks
    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    expect(raw.status).toBe(200);

    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    // Read the snapshot
    await reader.read();

    // Trigger a matching instancePatched event
    const patchedHandler = subscriptions.get('brick.instancePatched');
    expect(patchedHandler).toBeDefined();
    patchedHandler?.({
      type: 'brick.instancePatched',
      payload: {
        instanceId: 'inst-1',
        mutations: [],
      },
    });

    // Read the forwarded event
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('brick.instancePatched');
    expect(text).toContain('inst-1');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse does not forward events for other instances', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    // Read snapshot
    await reader.read();

    // Trigger instancePatched for a different instance (should be filtered)
    const patchedHandler = subscriptions.get('brick.instancePatched');
    patchedHandler?.({
      type: 'brick.instancePatched',
      payload: {
        instanceId: 'other-inst',
        mutations: [],
      },
    });

    // Trigger instanceMounted for a different instance
    const mountedHandler = subscriptions.get('brick.instanceMounted');
    expect(mountedHandler).toBeDefined();
    mountedHandler?.({
      type: 'brick.instanceMounted',
      payload: {
        instanceId: 'other-inst',
        brickTypeId: 'x:y',
      },
    });

    // Now send a matching event so we know the stream is still alive
    patchedHandler?.({
      type: 'brick.instancePatched',
      payload: {
        instanceId: 'inst-1',
        mutations: [],
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    // Should only contain the matching event, not the filtered ones
    expect(text).toContain('inst-1');
    expect(text).not.toContain('other-inst');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse forwards pluginDisconnected with filtered instanceIds', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
        makePlacement({
          instanceId: 'inst-2',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    // Trigger pluginDisconnected with mixed instance IDs
    const disconnectedHandler = subscriptions.get('brick.pluginDisconnected');
    expect(disconnectedHandler).toBeDefined();
    disconnectedHandler?.({
      type: 'brick.pluginDisconnected',
      payload: {
        pluginName: 'timer',
        instanceIds: [
          'inst-1',
          'other-inst',
          'inst-2',
        ],
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('brick.pluginDisconnected');
    expect(text).toContain('inst-1');
    expect(text).toContain('inst-2');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse does not forward pluginDisconnected when no matching IDs', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    // pluginDisconnected with no matching IDs — should NOT forward
    const disconnectedHandler = subscriptions.get('brick.pluginDisconnected');
    disconnectedHandler?.({
      type: 'brick.pluginDisconnected',
      payload: {
        pluginName: 'timer',
        instanceIds: [
          'other-inst',
        ],
      },
    });

    // Send a known matching event to verify stream is alive
    const patchedHandler = subscriptions.get('brick.instancePatched');
    patchedHandler?.({
      type: 'brick.instancePatched',
      payload: {
        instanceId: 'inst-1',
        mutations: [],
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    // Should only contain the patched event, not pluginDisconnected
    expect(text).toContain('brick.instancePatched');
    expect(text).not.toContain('brick.pluginDisconnected');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse forwards board.brickAdded and tracks new instanceId', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    // Simulate a brick being added to this board
    const addedHandler = subscriptions.get('board.brickAdded');
    expect(addedHandler).toBeDefined();
    addedHandler?.({
      type: 'board.brickAdded',
      payload: {
        boardId: 'board-1',
        instanceId: 'new-inst',
        placement: {},
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('board.brickAdded');
    expect(text).toContain('new-inst');

    // Now the new instance should be tracked — send an instancePatched for it
    const patchedHandler = subscriptions.get('brick.instancePatched');
    patchedHandler?.({
      type: 'brick.instancePatched',
      payload: {
        instanceId: 'new-inst',
        mutations: [],
      },
    });

    const { value: v2 } = await reader.read();
    const text2 = new TextDecoder().decode(v2);
    expect(text2).toContain('new-inst');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse ignores board.brickAdded for other boards', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    // brickAdded for a different board — should be ignored
    const addedHandler = subscriptions.get('board.brickAdded');
    addedHandler?.({
      type: 'board.brickAdded',
      payload: {
        boardId: 'other-board',
        instanceId: 'other-inst',
        placement: {},
      },
    });

    // Verify by sending a matching event
    const patchedHandler = subscriptions.get('brick.instancePatched');
    patchedHandler?.({
      type: 'brick.instancePatched',
      payload: {
        instanceId: 'inst-1',
        mutations: [],
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).not.toContain('board.brickAdded');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse forwards board.brickRemoved and untracks instanceId', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    // Remove inst-1 from this board
    const removedHandler = subscriptions.get('board.brickRemoved');
    expect(removedHandler).toBeDefined();
    removedHandler?.({
      type: 'board.brickRemoved',
      payload: {
        boardId: 'board-1',
        instanceId: 'inst-1',
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('board.brickRemoved');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse ignores board.brickRemoved for other boards', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    // brickRemoved for a different board
    const removedHandler = subscriptions.get('board.brickRemoved');
    removedHandler?.({
      type: 'board.brickRemoved',
      payload: {
        boardId: 'other-board',
        instanceId: 'some-inst',
      },
    });

    // Verify by sending a matching event
    const patchedHandler = subscriptions.get('brick.instancePatched');
    patchedHandler?.({
      type: 'brick.instancePatched',
      payload: {
        instanceId: 'inst-1',
        mutations: [],
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).not.toContain('board.brickRemoved');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse forwards layoutChanged for matching board', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    const layoutHandler = subscriptions.get('board.layoutChanged');
    expect(layoutHandler).toBeDefined();
    layoutHandler?.({
      type: 'board.layoutChanged',
      payload: {
        boardId: 'board-1',
        layouts: [],
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('board.layoutChanged');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse ignores layoutChanged for other boards', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    const layoutHandler = subscriptions.get('board.layoutChanged');
    layoutHandler?.({
      type: 'board.layoutChanged',
      payload: {
        boardId: 'other-board',
        layouts: [],
      },
    });

    // Verify stream is alive with a matching event
    const patchedHandler = subscriptions.get('brick.instancePatched');
    patchedHandler?.({
      type: 'brick.instancePatched',
      payload: {
        instanceId: 'inst-1',
        mutations: [],
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).not.toContain('board.layoutChanged');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse forwards brickLabelChanged for matching board', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    const labelHandler = subscriptions.get('board.brickLabelChanged');
    expect(labelHandler).toBeDefined();
    labelHandler?.({
      type: 'board.brickLabelChanged',
      payload: {
        boardId: 'board-1',
        instanceId: 'inst-1',
        label: 'Renamed',
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('board.brickLabelChanged');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse ignores brickLabelChanged for other boards', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    const labelHandler = subscriptions.get('board.brickLabelChanged');
    labelHandler?.({
      type: 'board.brickLabelChanged',
      payload: {
        boardId: 'other-board',
        instanceId: 'inst-x',
        label: 'X',
      },
    });

    // Verify alive
    const patchedHandler = subscriptions.get('brick.instancePatched');
    patchedHandler?.({
      type: 'brick.instancePatched',
      payload: {
        instanceId: 'inst-1',
        mutations: [],
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).not.toContain('board.brickLabelChanged');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse forwards brickConfigChanged for matching board', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    const configHandler = subscriptions.get('board.brickConfigChanged');
    expect(configHandler).toBeDefined();
    configHandler?.({
      type: 'board.brickConfigChanged',
      payload: {
        boardId: 'board-1',
        instanceId: 'inst-1',
        config: {
          theme: 'dark',
        },
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('board.brickConfigChanged');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse ignores brickConfigChanged for other boards', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const subscriptions = new Map<string, (action: unknown) => void>();
    mockEvents.subscribe.mockImplementation(
      (
        actionDef: {
          type: string;
        },
        handler: (action: unknown) => void
      ) => {
        subscriptions.set(actionDef.type, handler);
        return () => {};
      }
    );

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    await reader.read();

    const configHandler = subscriptions.get('board.brickConfigChanged');
    configHandler?.({
      type: 'board.brickConfigChanged',
      payload: {
        boardId: 'other-board',
        instanceId: 'inst-x',
        config: {},
      },
    });

    // Verify alive
    const patchedHandler = subscriptions.get('brick.instancePatched');
    patchedHandler?.({
      type: 'brick.instancePatched',
      payload: {
        instanceId: 'inst-1',
        mutations: [],
      },
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).not.toContain('board.brickConfigChanged');

    await reader.cancel();
  });

  test('GET /api/boards/:id/sse snapshot with no mounted instances sends empty array', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);
    // instances.get returns null for all
    mockInstances.get.mockReturnValue(null);

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));

    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    const { value } = await reader.read();
    await reader.cancel();

    const text = new TextDecoder().decode(value);
    expect(text).toContain('brick.snapshot');
    expect(text).toContain('"instances":[]');
  });

  test('GET /api/boards/:id/sse snapshot on board with no bricks', async () => {
    const board = makeBoard({
      bricks: [],
    });
    mockLoader.get.mockReturnValue(board);

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));

    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('unreachable');
    }
    const { value } = await reader.read();
    await reader.cancel();

    const text = new TextDecoder().decode(value);
    expect(text).toContain('brick.snapshot');
    expect(text).toContain('"instances":[]');
  });

  test('GET /api/boards/:id/sse unsubscribes from all events on cancel', async () => {
    const board = makeBoard({
      bricks: [
        makePlacement({
          instanceId: 'inst-1',
        }),
      ],
    });
    mockLoader.get.mockReturnValue(board);

    const unsubs = Array.from(
      {
        length: 8,
      },
      () => mock()
    );
    let subIdx = 0;
    mockEvents.subscribe.mockImplementation(() => {
      return unsubs[subIdx++] ?? (() => {});
    });

    const raw = await app.hono.fetch(new Request('http://test/api/boards/board-1/sse'));
    const reader = raw.body?.getReader();
    await reader?.read();
    await reader?.cancel();

    // All 8 unsubscribe callbacks should have been called
    for (const unsub of unsubs) {
      expect(unsub).toHaveBeenCalledTimes(1);
    }
  });
});
