import 'reflect-metadata';
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { registryRoutes } from '@/runtime/http/routes/registry';
import { Logger } from '@/runtime/logs/log-router';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginRegistry } from '@/runtime/registry';
import { NpmSearchService } from '@/runtime/services/npm-search';
import { VerifiedPluginsService } from '@/runtime/services/verified-plugins';
import { WorkspaceSearchService } from '@/runtime/services/workspace-search';

describe('registry routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockRegistry: {
    init: ReturnType<typeof mock>;
    list: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
    checkUpdates: ReturnType<typeof mock>;
    uninstall: ReturnType<typeof mock>;
  };
  let mockNpmSearch: {
    search: ReturnType<typeof mock>;
    getPackageDetails: ReturnType<typeof mock>;
  };
  let mockVerified: {
    getVerifiedList: ReturnType<typeof mock>;
    isVerified: ReturnType<typeof mock>;
    getVerifiedPlugin: ReturnType<typeof mock>;
  };
  let mockWorkspace: {
    findByName: ReturnType<typeof mock>;
    discover: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockRegistry = {
      init: mock().mockResolvedValue(undefined),
      list: mock().mockResolvedValue([]),
      get: mock().mockResolvedValue({ name: 'test-pkg', version: '1.0.0' }),
      checkUpdates: mock().mockResolvedValue([]),
      uninstall: mock().mockResolvedValue(undefined),
    };
    mockNpmSearch = {
      search: mock().mockResolvedValue({ plugins: [], total: 0 }),
      getPackageDetails: mock().mockResolvedValue(null),
    };
    mockVerified = {
      getVerifiedList: mock().mockResolvedValue([]),
      isVerified: mock().mockResolvedValue(false),
      getVerifiedPlugin: mock().mockResolvedValue(null),
    };

    stub(PluginRegistry, mockRegistry);
    stub(NpmSearchService, mockNpmSearch);
    stub(VerifiedPluginsService, mockVerified);
    stub(PluginManager, { getByName: mock().mockReturnValue(null) });
    stub(ConfigLoader, { get: mock().mockReturnValue({ plugins: [] }) });
    mockWorkspace = {
      findByName: mock().mockResolvedValue(null),
      discover: mock().mockResolvedValue([]),
    };
    stub(WorkspaceSearchService, mockWorkspace);
    stub(Logger);
    app = TestApp.create(registryRoutes);
  });

  // ─── Packages ─────────────────────────────────────────────────────────────

  test('GET /api/registry/packages returns list', async () => {
    const res = await app.get<{ packages: unknown[] }>('/api/registry/packages');

    expect(res.status).toBe(200);
    expect(res.body.packages).toEqual([]);
  });

  test('GET /api/registry/packages/:name returns package', async () => {
    const res = await app.get<{ package: { name: string } }>('/api/registry/packages/test-pkg');

    expect(res.status).toBe(200);
    expect(res.body.package.name).toBe('test-pkg');
  });

  test('DELETE /api/registry/packages/:name uninstalls package', async () => {
    const res = await app.delete('/api/registry/packages/test-pkg');

    expect(res.status).toBe(200);
    expect(mockRegistry.uninstall).toHaveBeenCalledWith('test-pkg');
  });

  // ─── Updates ──────────────────────────────────────────────────────────────

  test('GET /api/registry/updates checks for updates', async () => {
    const res = await app.get<{ updates: unknown[] }>('/api/registry/updates');

    expect(res.status).toBe(200);
    expect(res.body.updates).toEqual([]);
  });

  // ─── Version ──────────────────────────────────────────────────────────────

  test('GET /api/registry/version returns hub version', async () => {
    const res = await app.get<{ version: string; engines: { node: string } }>(
      '/api/registry/version'
    );

    expect(res.status).toBe(200);
    expect(typeof res.body.version).toBe('string');
    expect(typeof res.body.engines.node).toBe('string');
  });

  // ─── Search ───────────────────────────────────────────────────────────────

  test('GET /api/registry/search returns enriched results', async () => {
    mockNpmSearch.search.mockResolvedValue({
      plugins: [{ package: { name: '@brika/plugin-timer' }, score: 0.9 }],
      total: 1,
    });

    const res = await app.get<{ plugins: Array<{ installed: boolean }>; total: number }>(
      '/api/registry/search',
      { query: { q: 'timer' } }
    );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.plugins[0].installed).toBeFalse();
  });

  // ─── Local plugins ───────────────────────────────────────────────────────

  test('GET /api/registry/local-plugins returns discovered workspace plugins', async () => {
    mockWorkspace.discover.mockResolvedValue([
      {
        package: { name: '@brika/plugin-timer', version: '1.0.0' },
        installed: true,
        installedVersion: '1.0.0',
      },
    ]);

    const res = await app.get<{ plugins: Array<{ package: { name: string } }> }>(
      '/api/registry/local-plugins'
    );

    expect(res.status).toBe(200);
    expect(res.body.plugins).toHaveLength(1);
    expect(res.body.plugins[0].package.name).toBe('@brika/plugin-timer');
    expect(mockWorkspace.discover).toHaveBeenCalled();
  });

  test('GET /api/registry/local-plugins passes query parameter', async () => {
    await app.get('/api/registry/local-plugins', { query: { q: 'timer' } });

    expect(mockWorkspace.discover).toHaveBeenCalledWith('timer');
  });

  // ─── Verified ─────────────────────────────────────────────────────────────

  test('GET /api/registry/verified returns verified list', async () => {
    const res = await app.get('/api/registry/verified');

    expect(res.status).toBe(200);
  });

  // ─── Plugin details ───────────────────────────────────────────────────────

  test('GET /api/registry/plugins/:name returns 404 for unknown package', async () => {
    const res = await app.get<{ error: string }>('/api/registry/plugins/unknown-pkg');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Package not found');
  });

  test('GET /api/registry/plugins/:name returns local plugin when found in workspace', async () => {
    mockWorkspace.findByName.mockResolvedValue({
      rootDir: '/workspace/plugins/timer',
      pkg: {
        name: 'brika-plugin-timer',
        version: '1.0.0',
        displayName: 'Timer',
        description: 'A timer plugin',
        keywords: ['brika'],
        engines: { brika: '^0.1.0' },
      },
    });

    const res = await app.get<{ name: string; source: string; installed: boolean }>(
      '/api/registry/plugins/brika-plugin-timer'
    );

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('brika-plugin-timer');
    expect(res.body.source).toBe('local');
    expect(res.body.installed).toBeFalse();
  });

  test('GET /api/registry/plugins/:name returns enriched details', async () => {
    mockNpmSearch.getPackageDetails.mockResolvedValue({
      name: 'brika-plugin-timer',
      version: '2.0.0',
      engines: { brika: '^0.2.0' },
    });

    const res = await app.get<{ name: string; verified: boolean; installed: boolean }>(
      '/api/registry/plugins/brika-plugin-timer'
    );

    expect(res.status).toBe(200);
    expect(res.body.verified).toBeFalse();
    expect(res.body.installed).toBeFalse();
  });

  // ─── Plugin README ──────────────────────────────────────────────────────

  describe('GET /api/registry/plugins/:name/readme', () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    afterEach(() => {
      fetchSpy?.mockRestore();
    });

    test('returns readme content when CDN responds ok', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('# My Plugin', { status: 200 })
      );

      const res = await app.get<{ readme: string; filename: string }>(
        '/api/registry/plugins/brika-plugin-timer/readme'
      );

      expect(res.status).toBe(200);
      expect(res.body.readme).toBe('# My Plugin');
      expect(res.body.filename).toBe('README.md');
    });

    test('returns null when CDN responds not ok', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));

      const res = await app.get<{ readme: null; filename: null }>(
        '/api/registry/plugins/brika-plugin-timer/readme'
      );

      expect(res.status).toBe(200);
      expect(res.body.readme).toBeNull();
    });

    test('returns null on fetch error', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const res = await app.get<{ readme: null; filename: null }>(
        '/api/registry/plugins/brika-plugin-timer/readme'
      );

      expect(res.status).toBe(200);
      expect(res.body.readme).toBeNull();
    });
  });

  // ─── Plugin Icon ────────────────────────────────────────────────────────

  describe('GET /api/registry/plugins/:name/icon', () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    afterEach(() => {
      fetchSpy?.mockRestore();
    });

    test('returns icon when CDN has it', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      );

      const res = await app.get('/api/registry/plugins/brika-plugin-timer/icon');

      expect(res.status).toBe(200);
    });

    test('returns 404 when no icon found on CDN', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));

      const res = await app.get('/api/registry/plugins/brika-plugin-timer/icon');

      expect(res.status).toBe(404);
    });

    test('returns 404 on fetch error', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const res = await app.get('/api/registry/plugins/brika-plugin-timer/icon');

      expect(res.status).toBe(404);
    });
  });
});
