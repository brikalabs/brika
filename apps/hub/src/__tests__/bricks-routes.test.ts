import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import type { RegisteredBrickType } from '@/runtime/bricks';
import { BrickInstanceManager, BrickTypeRegistry } from '@/runtime/bricks';
import { bricksRoutes } from '@/runtime/http/routes/bricks';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';

const BRICK_TYPE: RegisteredBrickType = {
  fullId: 'timer:clock',
  localId: 'clock',
  pluginName: '@brika/plugin-timer',
  name: 'Clock',
  description: 'A clock widget',
  category: 'time',
  icon: 'clock',
  color: '#f59e0b',
  families: [],
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 6 },
  config: [{ name: 'tz', type: 'text', label: 'Timezone' }],
};

const BRICK_INSTANCE = {
  instanceId: 'inst-1',
  brickTypeId: 'timer:clock',
  pluginName: '@brika/plugin-timer',
  w: 3,
  h: 2,
  config: {},
  body: [{ type: 'text', props: { value: '12:00' } }],
};

describe('bricks routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockTypeRegistry: {
    list: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
  };
  let mockInstanceManager: {
    list: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
  };
  let mockLifecycle: {
    getProcess: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockTypeRegistry = {
      list: mock().mockReturnValue([BRICK_TYPE]),
      get: mock().mockReturnValue(BRICK_TYPE),
    };
    mockInstanceManager = {
      list: mock().mockReturnValue([BRICK_INSTANCE]),
      get: mock().mockReturnValue(BRICK_INSTANCE),
    };
    mockLifecycle = {
      getProcess: mock().mockReturnValue(null),
    };
    stub(BrickTypeRegistry, mockTypeRegistry);
    stub(BrickInstanceManager, mockInstanceManager);
    stub(PluginLifecycle, mockLifecycle);
    app = TestApp.create(bricksRoutes);
  });

  // ─── Brick Types ──────────────────────────────────────────────────────────

  test('GET /api/bricks/types returns list', async () => {
    const res = await app.get<Array<{ id: string; name: string }>>('/api/bricks/types');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('timer:clock');
    expect(res.body[0].name).toBe('Clock');
  });

  test('GET /api/bricks/types/:id returns type', async () => {
    const res = await app.get<{ id: string }>('/api/bricks/types/timer:clock');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('timer:clock');
  });

  test('GET /api/bricks/types/:id returns 404 for unknown type', async () => {
    mockTypeRegistry.get.mockReturnValue(undefined);

    const res = await app.get('/api/bricks/types/missing:type');

    expect(res.status).toBe(404);
  });

  test('GET /api/bricks/types/:typeId/config/:name/options returns empty when no process', async () => {
    const res = await app.get<{ options: unknown[] }>(
      '/api/bricks/types/timer:clock/config/tz/options'
    );

    expect(res.status).toBe(200);
    expect(res.body.options).toEqual([]);
  });

  test('GET /api/bricks/types/:typeId/config/:name/options fetches from process', async () => {
    const opts = [{ label: 'UTC', value: 'UTC' }];
    mockLifecycle.getProcess.mockReturnValue({
      fetchPreferenceOptions: mock().mockResolvedValue(opts),
    });

    const res = await app.get<{ options: unknown[] }>(
      '/api/bricks/types/timer:clock/config/tz/options'
    );

    expect(res.status).toBe(200);
    expect(res.body.options).toEqual(opts);
  });

  // ─── Brick Instances ──────────────────────────────────────────────────────

  test('GET /api/bricks/instances returns list', async () => {
    const res = await app.get<Array<{ instanceId: string }>>('/api/bricks/instances');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].instanceId).toBe('inst-1');
  });

  test('GET /api/bricks/instances/:id returns instance', async () => {
    const res = await app.get<{ instanceId: string }>('/api/bricks/instances/inst-1');

    expect(res.status).toBe(200);
    expect(res.body.instanceId).toBe('inst-1');
  });

  test('GET /api/bricks/instances/:id returns 404 for unknown instance', async () => {
    mockInstanceManager.get.mockReturnValue(undefined);

    const res = await app.get('/api/bricks/instances/missing');

    expect(res.status).toBe(404);
  });

  // ─── Action ───────────────────────────────────────────────────────────────

  test('POST /api/bricks/instances/:id/action dispatches action', async () => {
    const sendBrickInstanceAction = mock();
    mockLifecycle.getProcess.mockReturnValue({ sendBrickInstanceAction });

    const res = await app.post('/api/bricks/instances/inst-1/action', {
      actionId: 'toggle',
      payload: { on: true },
    });

    expect(res.status).toBe(200);
    expect(sendBrickInstanceAction).toHaveBeenCalledWith('inst-1', 'timer:clock', 'toggle', {
      on: true,
    });
  });

  test('POST /api/bricks/instances/:id/action returns 404 for missing instance', async () => {
    mockInstanceManager.get.mockReturnValue(undefined);

    const res = await app.post('/api/bricks/instances/missing/action', { actionId: 'toggle' });

    expect(res.status).toBe(404);
  });

  test('POST /api/bricks/instances/:id/action returns 404 when plugin not running', async () => {
    const res = await app.post('/api/bricks/instances/inst-1/action', { actionId: 'toggle' });

    expect(res.status).toBe(404);
  });
});
