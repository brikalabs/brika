import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { pluginsRoutes } from '@/runtime/http/routes/plugins';
import { MetricsStore } from '@/runtime/metrics';
import { PluginConfigService } from '@/runtime/plugins/plugin-config';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginPermissionService } from '@/runtime/plugins/plugin-permissions';
import { PluginRegistry } from '@/runtime/registry';
import { StateStore } from '@/runtime/state/state-store';

const PLUGIN = {
  uid: 'plg-1',
  name: '@brika/plugin-timer',
  version: '1.0.0',
  icon: null,
  rootDirectory: '/tmp/plugins/timer',
  pid: 1234,
};

describe('plugins routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockManager: {
    list: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
    load: ReturnType<typeof mock>;
    enable: ReturnType<typeof mock>;
    disable: ReturnType<typeof mock>;
    reload: ReturnType<typeof mock>;
    kill: ReturnType<typeof mock>;
    unload: ReturnType<typeof mock>;
  };
  let mockLifecycle: {
    getProcess: ReturnType<typeof mock>;
  };
  let mockConfig: {
    getSchema: ReturnType<typeof mock>;
    getConfig: ReturnType<typeof mock>;
    setConfig: ReturnType<typeof mock>;
  };
  let mockPermService: {
    setPermission: ReturnType<typeof mock>;
  };
  let mockMetrics: {
    get: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockManager = {
      list: mock().mockReturnValue([
        PLUGIN,
      ]),
      get: mock().mockReturnValue(PLUGIN),
      load: mock().mockResolvedValue(undefined),
      enable: mock().mockResolvedValue(undefined),
      disable: mock().mockResolvedValue(undefined),
      reload: mock().mockResolvedValue(undefined),
      kill: mock().mockResolvedValue(undefined),
      unload: mock().mockResolvedValue(undefined),
    };
    mockLifecycle = {
      getProcess: mock().mockReturnValue(null),
    };
    mockConfig = {
      getSchema: mock().mockReturnValue([]),
      getConfig: mock().mockReturnValue({}),
      setConfig: mock().mockResolvedValue({
        success: true,
      }),
    };
    mockPermService = {
      setPermission: mock().mockResolvedValue([
        'location',
      ]),
    };
    mockMetrics = {
      get: mock().mockReturnValue([]),
    };

    stub(PluginManager, mockManager);
    stub(PluginLifecycle, mockLifecycle);
    stub(PluginConfigService, mockConfig);
    stub(PluginPermissionService, mockPermService);
    stub(MetricsStore, mockMetrics);
    stub(PluginRegistry, {
      uninstall: mock().mockResolvedValue(undefined),
    });
    stub(StateStore, {
      remove: mock().mockResolvedValue(undefined),
    });
    app = TestApp.create(pluginsRoutes);
  });

  // ─── List & Get ───────────────────────────────────────────────────────────

  test('GET /api/plugins returns list', async () => {
    const res = await app.get('/api/plugins');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBeTrue();
  });

  test('GET /api/plugins/:uid returns plugin details', async () => {
    const res = await app.get('/api/plugins/plg-1');

    expect(res.status).toBe(200);
    expect(mockManager.get).toHaveBeenCalledWith('plg-1');
  });

  test('GET /api/plugins/:uid returns 404 for unknown plugin', async () => {
    mockManager.get.mockReturnValue(null);

    const res = await app.get('/api/plugins/missing');

    expect(res.status).toBe(404);
  });

  // ─── Icon ────────────────────────────────────────────────────────────────

  test('GET /api/plugins/:uid/icon returns 204 when plugin has no icon', async () => {
    const res = await app.get('/api/plugins/plg-1/icon');

    expect(res.status).toBe(204);
  });

  // ─── Assets ─────────────────────────────────────────────────────────────

  test('GET /api/plugins/:uid/assets/* returns 404 for non-existent asset', async () => {
    const res = await app.get('/api/plugins/plg-1/assets/missing.png');

    expect(res.status).toBe(404);
  });

  // ─── README ─────────────────────────────────────────────────────────────

  test('GET /api/plugins/:uid/readme returns null when no readme found', async () => {
    const res = await app.get<{
      readme: null;
      filename: null;
    }>('/api/plugins/plg-1/readme');

    expect(res.status).toBe(200);
    expect(res.body.readme).toBeNull();
    expect(res.body.filename).toBeNull();
  });

  // ─── Load ─────────────────────────────────────────────────────────────────

  test('POST /api/plugins/load loads a plugin', async () => {
    const res = await app.post('/api/plugins/load', {
      ref: '@brika/plugin-timer',
    });

    expect(res.status).toBe(200);
    expect(mockManager.load).toHaveBeenCalledWith('@brika/plugin-timer');
  });

  // ─── Lifecycle actions ────────────────────────────────────────────────────

  test('POST /api/plugins/:uid/enable enables plugin', async () => {
    const res = await app.post('/api/plugins/plg-1/enable', {});

    expect(res.status).toBe(200);
    expect(mockManager.enable).toHaveBeenCalledWith('plg-1');
  });

  test('POST /api/plugins/:uid/disable disables plugin', async () => {
    const res = await app.post('/api/plugins/plg-1/disable', {});

    expect(res.status).toBe(200);
    expect(mockManager.disable).toHaveBeenCalledWith('plg-1');
  });

  test('POST /api/plugins/:uid/reload reloads plugin', async () => {
    const res = await app.post('/api/plugins/plg-1/reload', {});

    expect(res.status).toBe(200);
    expect(mockManager.reload).toHaveBeenCalledWith('plg-1');
  });

  test('POST /api/plugins/:uid/kill kills plugin', async () => {
    const res = await app.post('/api/plugins/plg-1/kill', {});

    expect(res.status).toBe(200);
    expect(mockManager.kill).toHaveBeenCalledWith('plg-1');
  });

  // ─── Config ───────────────────────────────────────────────────────────────

  test('GET /api/plugins/:uid/config returns schema and values', async () => {
    const res = await app.get<{
      schema: unknown[];
      values: Record<string, unknown>;
    }>('/api/plugins/plg-1/config');

    expect(res.status).toBe(200);
    expect(res.body.schema).toEqual([]);
    expect(res.body.values).toEqual({});
  });

  test('GET /api/plugins/:uid/config resolves dynamic-dropdown options via process', async () => {
    const fetchOptions = mock().mockResolvedValue([
      {
        value: 'tz1',
        label: 'America/Montreal',
      },
    ]);
    mockLifecycle.getProcess.mockReturnValue({
      fetchPreferenceOptions: fetchOptions,
    });
    mockConfig.getSchema.mockReturnValue([
      {
        name: 'timezone',
        type: 'dynamic-dropdown',
      },
      {
        name: 'interval',
        type: 'number',
      },
    ]);

    const res = await app.get('/api/plugins/plg-1/config');

    expect(res.status).toBe(200);
    expect(fetchOptions).toHaveBeenCalledWith('timezone');
  });

  test('PUT /api/plugins/:uid/config updates config', async () => {
    const res = await app.put('/api/plugins/plg-1/config', {
      interval: 5000,
    });

    expect(res.status).toBe(200);
    expect(mockConfig.setConfig).toHaveBeenCalled();
  });

  test('PUT /api/plugins/:uid/config sends preferences to running process', async () => {
    const sendPrefs = mock();
    mockLifecycle.getProcess.mockReturnValue({
      sendPreferences: sendPrefs,
    });
    mockConfig.getConfig.mockReturnValue({
      interval: 5000,
    });

    const res = await app.put('/api/plugins/plg-1/config', {
      interval: 5000,
    });

    expect(res.status).toBe(200);
    expect(sendPrefs).toHaveBeenCalled();
  });

  test('PUT /api/plugins/:uid/config returns 422 on validation error', async () => {
    mockConfig.setConfig.mockResolvedValue({
      success: false,
      error: {
        issues: [
          {
            message: 'bad',
          },
        ],
      },
    });

    const res = await app.put('/api/plugins/plg-1/config', {
      bad: true,
    });

    expect(res.status).toBe(422);
  });

  // ─── Preferences ──────────────────────────────────────────────────────────

  test('GET /api/plugins/:uid/preferences/:name/options returns empty when no process', async () => {
    const res = await app.get<{
      options: unknown[];
    }>('/api/plugins/plg-1/preferences/tz/options');

    expect(res.status).toBe(200);
    expect(res.body.options).toEqual([]);
  });

  test('GET /api/plugins/:uid/preferences/:name/options returns options from process', async () => {
    const fetchOptions = mock().mockResolvedValue([
      {
        value: 'America/Montreal',
        label: 'Montreal',
      },
    ]);
    mockLifecycle.getProcess.mockReturnValue({
      fetchPreferenceOptions: fetchOptions,
    });

    const res = await app.get('/api/plugins/plg-1/preferences/tz/options');

    expect(res.status).toBe(200);
    expect(fetchOptions).toHaveBeenCalledWith('tz');
  });

  // ─── Permissions ──────────────────────────────────────────────────────────

  test('PUT /api/plugins/:uid/permissions toggles permission', async () => {
    const res = await app.put('/api/plugins/plg-1/permissions', {
      permission: 'location',
      granted: true,
    });

    expect(res.status).toBe(200);
    expect(mockPermService.setPermission).toHaveBeenCalledWith(
      '@brika/plugin-timer',
      'location',
      true
    );
  });

  // ─── Metrics ──────────────────────────────────────────────────────────────

  test('GET /api/plugins/:uid/metrics returns metrics', async () => {
    const res = await app.get<{
      pid: number;
      current: null;
      history: unknown[];
    }>('/api/plugins/plg-1/metrics');

    expect(res.status).toBe(200);
    expect(res.body.pid).toBe(1234);
    expect(res.body.history).toEqual([]);
  });

  // ─── Delete ───────────────────────────────────────────────────────────────

  test('DELETE /api/plugins/:uid uninstalls plugin', async () => {
    const res = await app.delete('/api/plugins/plg-1');

    expect(res.status).toBe(200);
    expect(mockManager.disable).toHaveBeenCalled();
    expect(mockManager.unload).toHaveBeenCalled();
  });

  test('DELETE /api/plugins/:uid returns 404 for unknown plugin', async () => {
    mockManager.get.mockReturnValue(null);

    const res = await app.delete('/api/plugins/missing');

    expect(res.status).toBe(404);
  });
});
