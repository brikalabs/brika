import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { modulesRoutes } from '@/runtime/http/routes/modules';
import { ModuleCompiler } from '@/runtime/modules';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';

const TEST_DIR = join(tmpdir(), `brika-test-modules-${Date.now()}`);
const MOCK_JS_PATH = join(TEST_DIR, 'settings.abc123.js');

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await Bun.write(MOCK_JS_PATH, 'console.log("hello")');
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('module routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockLifecycle: {
    resolvePluginNameByUid: ReturnType<typeof mock>;
  };
  let mockCompiler: {
    get: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockLifecycle = {
      resolvePluginNameByUid: mock().mockReturnValue('@brika/plugin-timer'),
    };
    mockCompiler = {
      get: mock().mockReturnValue({
        hash: 'abc123',
        filePath: MOCK_JS_PATH,
      }),
    };
    stub(PluginLifecycle, mockLifecycle);
    stub(ModuleCompiler, mockCompiler);
    app = TestApp.create(modulesRoutes);
  });

  test('serves a page module with immutable cache', async () => {
    const res = await app.get('/api/modules/plg-1/page/settings.abc123.js');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/javascript');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(mockCompiler.get).toHaveBeenCalledWith('@brika/plugin-timer:pages/settings');
  });

  test('serves a brick module', async () => {
    await app.get('/api/modules/plg-1/brick/clock.abc123.js');

    expect(mockCompiler.get).toHaveBeenCalledWith('@brika/plugin-timer:bricks/clock');
  });

  test('serves a block view module', async () => {
    await app.get('/api/modules/plg-1/blockView/spark-receiver.abc123.js');

    expect(mockCompiler.get).toHaveBeenCalledWith('@brika/plugin-timer:blocks/spark-receiver.view');
  });

  test('returns 404 for an unknown module kind', async () => {
    const res = await app.get('/api/modules/plg-1/widget/settings.abc.js');

    expect(res.status).toBe(404);
    expect(mockCompiler.get).not.toHaveBeenCalled();
  });

  test('returns 404 when the module is not compiled', async () => {
    mockCompiler.get.mockReturnValue(undefined);

    const res = await app.get('/api/modules/plg-1/page/missing.xyz.js');

    expect(res.status).toBe(404);
  });

  test('returns 404 when the plugin is unknown', async () => {
    mockLifecycle.resolvePluginNameByUid.mockReturnValue(undefined);

    const res = await app.get('/api/modules/missing/page/settings.abc123.js');

    expect(res.status).toBe(404);
  });

  test('parses the module id from a filename that contains a hash', async () => {
    await app.get('/api/modules/plg-1/page/dashboard.r8k2x.js');

    expect(mockCompiler.get).toHaveBeenCalledWith('@brika/plugin-timer:pages/dashboard');
  });
});
