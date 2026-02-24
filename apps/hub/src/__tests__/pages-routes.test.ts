import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { pageRoutes } from '@/runtime/http/routes/pages';
import { ModuleCompiler } from '@/runtime/modules';
import { PluginManager } from '@/runtime/plugins/plugin-manager';

const PLUGIN = { uid: 'plg-1', name: '@brika/plugin-timer' };

describe('page routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockManager: { get: ReturnType<typeof mock> };
  let mockCompiler: { get: ReturnType<typeof mock> };

  useTestBed(() => {
    mockManager = { get: mock().mockReturnValue(PLUGIN) };
    mockCompiler = {
      get: mock().mockReturnValue({ content: 'console.log("hello")', etag: '"abc123"' }),
    };
    stub(PluginManager, mockManager);
    stub(ModuleCompiler, mockCompiler);
    app = TestApp.create(pageRoutes);
  });

  test('GET /module.js returns compiled JS with ETag', async () => {
    const res = await app.get('/api/plugins/plg-1/pages/settings/module.js');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/javascript');
    expect(res.headers.get('etag')).toBe('"abc123"');
    expect(mockCompiler.get).toHaveBeenCalledWith('@brika/plugin-timer:settings');
  });

  test('GET /module.js returns 304 when ETag matches', async () => {
    const res = await app.get('/api/plugins/plg-1/pages/settings/module.js', {
      headers: { 'If-None-Match': '"abc123"' },
    });

    expect(res.status).toBe(304);
  });

  test('GET /module.js returns 404 when module not found', async () => {
    mockCompiler.get.mockReturnValue(undefined);

    const res = await app.get('/api/plugins/plg-1/pages/missing/module.js');

    expect(res.status).toBe(404);
  });

  test('GET /module.js returns 404 when plugin not found', async () => {
    mockManager.get.mockReturnValue(null);

    const res = await app.get('/api/plugins/missing/pages/settings/module.js');

    expect(res.status).toBe(404);
  });
});
