import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { pageRoutes } from '@/runtime/http/routes/pages';
import { ModuleCompiler } from '@/runtime/modules';
import { PluginManager } from '@/runtime/plugins/plugin-manager';

const TEST_DIR = join(tmpdir(), `brika-test-pages-${Date.now()}`);
const MOCK_JS_PATH = join(TEST_DIR, 'settings.abc123.js');

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await Bun.write(MOCK_JS_PATH, 'console.log("hello")');
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

const PLUGIN = {
  uid: 'plg-1',
  name: '@brika/plugin-timer',
};

describe('page routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockManager: {
    get: ReturnType<typeof mock>;
  };
  let mockCompiler: {
    get: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockManager = {
      get: mock().mockReturnValue(PLUGIN),
    };
    mockCompiler = {
      get: mock().mockReturnValue({
        hash: 'abc123',
        filePath: MOCK_JS_PATH,
      }),
    };
    stub(PluginManager, mockManager);
    stub(ModuleCompiler, mockCompiler);
    app = TestApp.create(pageRoutes);
  });

  test('GET /:file returns compiled JS with immutable cache', async () => {
    const res = await app.get('/api/plugins/plg-1/pages/settings.abc123.js');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/javascript');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('etag')).toBeNull();
    expect(mockCompiler.get).toHaveBeenCalledWith('@brika/plugin-timer:pages/settings');
  });

  test('GET /:file returns 404 when module not found', async () => {
    mockCompiler.get.mockReturnValue(undefined);

    const res = await app.get('/api/plugins/plg-1/pages/missing.xyz.js');

    expect(res.status).toBe(404);
  });

  test('GET /:file returns 404 when plugin not found', async () => {
    mockManager.get.mockReturnValue(null);

    const res = await app.get('/api/plugins/missing/pages/settings.abc123.js');

    expect(res.status).toBe(404);
  });

  test('GET /:file parses pageId from filename with hash', async () => {
    await app.get('/api/plugins/plg-1/pages/dashboard.r8k2x.js');

    expect(mockCompiler.get).toHaveBeenCalledWith('@brika/plugin-timer:pages/dashboard');
  });
});
