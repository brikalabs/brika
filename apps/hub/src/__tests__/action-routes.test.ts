import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { actionRoutes } from '@/runtime/http/routes/action-routes';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { PluginManager } from '@/runtime/plugins/plugin-manager';

const PLUGIN = {
  uid: 'plg-1',
  name: '@brika/plugin-timer',
};

describe('action routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockManager: {
    get: ReturnType<typeof mock>;
  };
  let mockLifecycle: {
    getProcess: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockManager = {
      get: mock().mockReturnValue(PLUGIN),
    };
    mockLifecycle = {
      getProcess: mock().mockReturnValue(null),
    };
    stub(PluginManager, mockManager);
    stub(PluginLifecycle, mockLifecycle);
    app = TestApp.create(actionRoutes);
  });

  test('POST /:uid/actions/:actionId returns 404 when plugin not found', async () => {
    mockManager.get.mockReturnValue(null);

    const res = await app.post('/api/plugins/plg-1/actions/getData', {});

    expect(res.status).toBe(404);
  });

  test('POST /:uid/actions/:actionId returns 404 when plugin not running', async () => {
    const res = await app.post('/api/plugins/plg-1/actions/getData', {});

    expect(res.status).toBe(404);
  });

  test('POST /:uid/actions/:actionId returns data on success', async () => {
    mockLifecycle.getProcess.mockReturnValue({
      callPluginAction: mock().mockResolvedValue({
        ok: true,
        data: {
          count: 42,
        },
      }),
    });

    const res = await app.post('/api/plugins/plg-1/actions/getData', {});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        count: 42,
      },
    });
  });

  test('POST /:uid/actions/:actionId returns 500 on action error', async () => {
    mockLifecycle.getProcess.mockReturnValue({
      callPluginAction: mock().mockResolvedValue({
        ok: false,
        error: 'failed',
      }),
    });

    const res = await app.post('/api/plugins/plg-1/actions/getData', {});

    expect(res.status).toBe(500);
  });
});
