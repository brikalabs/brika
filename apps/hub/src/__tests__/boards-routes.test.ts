import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { BrickInstanceManager } from '@/runtime/bricks';
import { BoardLoader, BoardService } from '@/runtime/boards';
import { EventSystem } from '@/runtime/events/event-system';
import { boardsRoutes } from '@/runtime/http/routes/boards';

const BOARD = {
  id: 'board-1',
  name: 'Home',
  icon: 'house',
  columns: 12,
  bricks: [
    { instanceId: 'inst-1', brickTypeId: 'timer:clock', x: 0, y: 0, w: 3, h: 2, config: {} },
  ],
};

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

  useTestBed(() => {
    mockLoader = {
      list: mock().mockReturnValue([BOARD]),
      get: mock().mockReturnValue(BOARD),
      saveBoard: mock().mockResolvedValue(undefined),
      deleteBoard: mock().mockResolvedValue(true),
      reorder: mock().mockResolvedValue(true),
    };
    mockService = {
      addBrick: mock().mockResolvedValue({ instanceId: 'new-1', brickTypeId: 'timer:clock' }),
      removeBrick: mock().mockResolvedValue(true),
      updateBrickLabel: mock().mockResolvedValue(undefined),
      updateBrickConfig: mock().mockResolvedValue(undefined),
      moveBrick: mock().mockResolvedValue(undefined),
      batchUpdateLayout: mock().mockResolvedValue(true),
      unmountBoard: mock(),
      viewerConnected: mock(),
      viewerDisconnected: mock(),
    };
    stub(BoardLoader, mockLoader);
    stub(BoardService, mockService);
    stub(EventSystem);
    stub(BrickInstanceManager, { get: mock().mockReturnValue(null), list: mock().mockReturnValue([]) });
    app = TestApp.create(boardsRoutes);
  });

  // ─── List (handler creates new objects via .map → body works) ─────────────

  test('GET /api/boards returns summary list', async () => {
    const res = await app.get<Array<{ id: string; name: string; brickCount: number }>>('/api/boards');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('board-1');
    expect(res.body[0].name).toBe('Home');
    expect(res.body[0].brickCount).toBe(1);
  });

  // ─── Create ───────────────────────────────────────────────────────────────

  test('POST /api/boards creates a new board', async () => {
    const res = await app.post('/api/boards', { name: 'Dashboard' });

    expect(res.status).toBe(200);
    expect(mockLoader.saveBoard).toHaveBeenCalledTimes(1);
  });

  test('POST /api/boards validates body', async () => {
    const res = await app.post('/api/boards', {});

    expect(res.status).toBe(400);
  });

  // ─── Reorder ──────────────────────────────────────────────────────────────

  test('PUT /api/boards/order reorders boards', async () => {
    const res = await app.put('/api/boards/order', { ids: ['board-1', 'board-2'] });

    expect(res.status).toBe(200);
    expect(mockLoader.reorder).toHaveBeenCalledWith(['board-1', 'board-2']);
  });

  test('PUT /api/boards/order returns 404 for invalid IDs', async () => {
    mockLoader.reorder.mockResolvedValue(false);

    const res = await app.put('/api/boards/order', { ids: ['missing'] });

    expect(res.status).toBe(404);
  });

  // ─── Get ──────────────────────────────────────────────────────────────────

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

  // ─── Update ───────────────────────────────────────────────────────────────

  test('PUT /api/boards/:id updates metadata', async () => {
    const res = await app.put('/api/boards/board-1', { name: 'Updated' });

    expect(res.status).toBe(200);
    expect(mockLoader.saveBoard).toHaveBeenCalled();
  });

  test('PUT /api/boards/:id returns 404 for unknown board', async () => {
    mockLoader.get.mockReturnValue(undefined);

    const res = await app.put('/api/boards/missing', { name: 'X' });

    expect(res.status).toBe(404);
  });

  // ─── Delete ───────────────────────────────────────────────────────────────

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

  // ─── Add brick ────────────────────────────────────────────────────────────

  test('POST /api/boards/:id/bricks adds a brick', async () => {
    const res = await app.post('/api/boards/board-1/bricks', {
      brickTypeId: 'timer:clock',
      config: { interval: 1000 },
      position: { x: 0, y: 0 },
      size: { w: 3, h: 2 },
    });

    expect(res.status).toBe(200);
    expect(mockService.addBrick).toHaveBeenCalled();
  });

  test('POST /api/boards/:id/bricks returns 404 when board or type missing', async () => {
    mockService.addBrick.mockResolvedValue(null);

    const res = await app.post('/api/boards/board-1/bricks', { brickTypeId: 'missing:type' });

    expect(res.status).toBe(404);
  });

  // ─── Update brick ────────────────────────────────────────────────────────

  test('PUT /api/boards/:id/bricks/:instanceId updates label, config, and position', async () => {
    const res = await app.put('/api/boards/board-1/bricks/inst-1', {
      label: 'My Clock',
      config: { interval: 500 },
      position: { x: 1, y: 2 },
      size: { w: 4, h: 3 },
    });

    expect(res.status).toBe(200);
    expect(mockService.updateBrickLabel).toHaveBeenCalledWith('board-1', 'inst-1', 'My Clock');
    expect(mockService.updateBrickConfig).toHaveBeenCalled();
    expect(mockService.moveBrick).toHaveBeenCalled();
  });

  // ─── Remove brick ────────────────────────────────────────────────────────

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

  // ─── Layout ───────────────────────────────────────────────────────────────

  test('PUT /api/boards/:id/layout batch updates layout', async () => {
    const layouts = [{ instanceId: 'inst-1', x: 0, y: 0, w: 6, h: 4 }];

    const res = await app.put('/api/boards/board-1/layout', { layouts });

    expect(res.status).toBe(200);
    expect(mockService.batchUpdateLayout).toHaveBeenCalledWith('board-1', layouts);
  });

  test('PUT /api/boards/:id/layout returns 404 for unknown board', async () => {
    mockService.batchUpdateLayout.mockResolvedValue(false);

    const res = await app.put('/api/boards/board-1/layout', {
      layouts: [{ instanceId: 'inst-1', x: 0, y: 0, w: 6, h: 4 }],
    });

    expect(res.status).toBe(404);
  });
});
