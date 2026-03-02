import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import type { RegisteredBrickType } from '@/runtime/bricks';
import { BrickTypeRegistry } from '@/runtime/bricks';
import { bricksRoutes } from '@/runtime/http/routes/bricks';
import { ModuleCompiler } from '@/runtime/modules';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';

const TEST_DIR = join(tmpdir(), `brika-test-bricks-${Date.now()}`);
const MOCK_JS_PATH = join(TEST_DIR, 'clock.abc123.js');

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await Bun.write(MOCK_JS_PATH, 'export default {}');
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

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
  minSize: {
    w: 2,
    h: 2,
  },
  maxSize: {
    w: 6,
    h: 6,
  },
  config: [
    {
      name: 'tz',
      type: 'text',
      label: 'Timezone',
    },
  ],
};

describe('bricks routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockTypeRegistry: {
    list: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
  };
  let mockLifecycle: {
    getProcess: ReturnType<typeof mock>;
    resolvePluginNameByUid: ReturnType<typeof mock>;
  };
  let mockCompiler: {
    get: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockTypeRegistry = {
      list: mock().mockReturnValue([BRICK_TYPE]),
      get: mock().mockReturnValue(BRICK_TYPE),
    };
    mockLifecycle = {
      getProcess: mock().mockReturnValue(null),
      resolvePluginNameByUid: mock().mockReturnValue(null),
    };
    mockCompiler = {
      get: mock().mockReturnValue(null),
    };
    stub(BrickTypeRegistry, mockTypeRegistry);
    stub(PluginLifecycle, mockLifecycle);
    stub(ModuleCompiler, mockCompiler);
    app = TestApp.create(bricksRoutes);
  });

  // ─── Brick Types ──────────────────────────────────────────────────────────

  test('GET /api/bricks/types returns list', async () => {
    const res =
      await app.get<
        Array<{
          id: string;
          name: string;
        }>
      >('/api/bricks/types');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('timer:clock');
    expect(res.body[0].name).toBe('Clock');
  });

  test('GET /api/bricks/types/:id returns type', async () => {
    const res = await app.get<{
      id: string;
    }>('/api/bricks/types/timer:clock');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('timer:clock');
  });

  test('GET /api/bricks/types/:id returns 404 for unknown type', async () => {
    mockTypeRegistry.get.mockReturnValue(undefined);

    const res = await app.get('/api/bricks/types/missing:type');

    expect(res.status).toBe(404);
  });

  test('GET /api/bricks/types/:typeId/config/:name/options returns empty when no process', async () => {
    const res = await app.get<{
      options: unknown[];
    }>('/api/bricks/types/timer:clock/config/tz/options');

    expect(res.status).toBe(200);
    expect(res.body.options).toEqual([]);
  });

  test('GET /api/bricks/types/:typeId/config/:name/options fetches from process', async () => {
    const opts = [
      {
        label: 'UTC',
        value: 'UTC',
      },
    ];
    mockLifecycle.getProcess.mockReturnValue({
      fetchPreferenceOptions: mock().mockResolvedValue(opts),
    });

    const res = await app.get<{
      options: unknown[];
    }>('/api/bricks/types/timer:clock/config/tz/options');

    expect(res.status).toBe(200);
    expect(res.body.options).toEqual(opts);
  });

  // ─── Module Serving ─────────────────────────────────────────────────────────

  test('GET /api/bricks/modules/:pluginUid/:file returns compiled module', async () => {
    mockLifecycle.resolvePluginNameByUid.mockReturnValue('@brika/plugin-timer');
    mockCompiler.get.mockReturnValue({
      hash: 'abc123',
      filePath: MOCK_JS_PATH,
    });

    const res = await app.get('/api/bricks/modules/plg-1/clock.abc123.js');

    expect(res.status).toBe(200);
  });

  test('GET /api/bricks/modules/:pluginUid/:file returns 404 for unknown plugin', async () => {
    mockLifecycle.resolvePluginNameByUid.mockReturnValue(null);

    const res = await app.get('/api/bricks/modules/unknown-uid/clock.abc.js');

    expect(res.status).toBe(404);
  });

  test('GET /api/bricks/modules/:pluginUid/:file returns 404 for unknown module', async () => {
    mockLifecycle.resolvePluginNameByUid.mockReturnValue('@brika/plugin-timer');
    mockCompiler.get.mockReturnValue(null);

    const res = await app.get('/api/bricks/modules/plg-1/missing.abc.js');

    expect(res.status).toBe(404);
  });

  // ─── Action ───────────────────────────────────────────────────────────────

  test('POST /api/bricks/instances/:id/action dispatches action', async () => {
    const sendBrickInstanceAction = mock();
    mockLifecycle.getProcess.mockReturnValue({
      sendBrickInstanceAction,
    });

    const res = await app.post('/api/bricks/instances/inst-1/action', {
      brickTypeId: 'timer:clock',
      actionId: 'toggle',
      payload: {
        on: true,
      },
    });

    expect(res.status).toBe(200);
    expect(sendBrickInstanceAction).toHaveBeenCalledWith('inst-1', 'timer:clock', 'toggle', {
      on: true,
    });
  });

  test('POST /api/bricks/instances/:id/action returns 404 for missing brick type', async () => {
    mockTypeRegistry.get.mockReturnValue(undefined);

    const res = await app.post('/api/bricks/instances/missing/action', {
      brickTypeId: 'missing:type',
      actionId: 'toggle',
    });

    expect(res.status).toBe(404);
  });

  test('POST /api/bricks/instances/:id/action returns 404 when plugin not running', async () => {
    const res = await app.post('/api/bricks/instances/inst-1/action', {
      brickTypeId: 'timer:clock',
      actionId: 'toggle',
    });

    expect(res.status).toBe(404);
  });
});
