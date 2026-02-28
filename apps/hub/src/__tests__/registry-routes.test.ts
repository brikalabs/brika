/**
 * Tests for registry routes (/api/registry)
 */
import 'reflect-metadata';
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { provide, stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { useBunMock } from '@brika/testing';
import { registryRoutes } from '@/runtime/http/routes/registry';
import { Logger } from '@/runtime/logs/log-router';
import { PluginRegistry } from '@/runtime/registry';
import type { OperationProgress } from '@/runtime/registry/types';
import { StoreService } from '@/runtime/store';

describe('registry routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockRegistry: {
    init: ReturnType<typeof mock>;
    install: ReturnType<typeof mock>;
    update: ReturnType<typeof mock>;
    list: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
    checkUpdates: ReturnType<typeof mock>;
    uninstall: ReturnType<typeof mock>;
  };
  let mockStore: {
    search: ReturnType<typeof mock>;
    getVerifiedList: ReturnType<typeof mock>;
    getPluginDetails: ReturnType<typeof mock>;
    getLocalPluginRoot: ReturnType<typeof mock>;
  };
  let mockLogger: {
    error: ReturnType<typeof mock>;
    withSource: ReturnType<typeof mock>;
  };

  const bun = useBunMock();

  useTestBed(() => {
    mockRegistry = {
      init: mock().mockResolvedValue(undefined),
      install: mock(),
      update: mock(),
      list: mock().mockResolvedValue([]),
      get: mock().mockResolvedValue({ name: 'test-pkg', version: '1.0.0' }),
      checkUpdates: mock().mockResolvedValue([]),
      uninstall: mock().mockResolvedValue(undefined),
    };
    mockStore = {
      search: mock().mockResolvedValue({ plugins: [], total: 0 }),
      getVerifiedList: mock().mockResolvedValue({ plugins: [], version: '1.0.0', lastUpdated: '' }),
      getPluginDetails: mock().mockResolvedValue(null),
      getLocalPluginRoot: mock().mockResolvedValue(null),
    };
    mockLogger = {
      error: mock(),
      withSource: mock().mockReturnThis(),
    };

    // Use `provide` (not `stub`) for PluginRegistry so that async generators
    // returned by install/update are not wrapped by the deep-stub proxy, which
    // breaks async iteration (the proxy's function wrapper loses generator context).
    provide(PluginRegistry, mockRegistry as InstanceType<typeof PluginRegistry>);
    stub(StoreService, mockStore);
    stub(Logger, mockLogger);

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

  test('GET /api/registry/search returns results from all sources', async () => {
    mockStore.search.mockResolvedValue({
      plugins: [{ package: { name: '@brika/plugin-timer' }, installed: false, source: 'local' }],
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

  test('GET /api/registry/search passes query and pagination to StoreService', async () => {
    await app.get('/api/registry/search', { query: { q: 'timer', limit: '5', offset: '10' } });

    expect(mockStore.search).toHaveBeenCalledWith('timer', 5, 10);
  });

  test('GET /api/registry/search uses defaults when pagination not provided', async () => {
    await app.get('/api/registry/search');

    expect(mockStore.search).toHaveBeenCalledWith(undefined, 20, 0);
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
    mockStore.getPluginDetails.mockResolvedValue({
      name: 'brika-plugin-timer',
      version: '1.0.0',
      displayName: 'Timer',
      description: 'A timer plugin',
      keywords: ['brika'],
      engines: { brika: '^0.1.0' },
      verified: false,
      featured: false,
      source: 'local',
      installed: false,
      installVersion: 'workspace:*',
      compatible: true,
      npm: { downloads: 0, publishedAt: '' },
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
    mockStore.getPluginDetails.mockResolvedValue({
      name: 'brika-plugin-timer',
      version: '2.0.0',
      engines: { brika: '^0.2.0' },
      verified: false,
      featured: false,
      source: 'npm',
      installed: false,
      installVersion: '2.0.0',
      compatible: true,
      npm: { downloads: 0, publishedAt: '' },
    });

    const res = await app.get<{ name: string; verified: boolean; installed: boolean }>(
      '/api/registry/plugins/brika-plugin-timer'
    );

    expect(res.status).toBe(200);
    expect(res.body.verified).toBeFalse();
    expect(res.body.installed).toBeFalse();
  });

  // ─── Install (SSE) ────────────────────────────────────────────────────────

  describe('POST /api/registry/install', () => {
    function postInstall(body: Record<string, unknown>) {
      return app.hono.fetch(
        new Request('http://test/api/registry/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
    }

    test('returns SSE stream with progress events for install', async () => {
      async function* gen(): AsyncGenerator<OperationProgress> {
        yield { phase: 'resolving', operation: 'install', package: 'my-plugin' };
        yield { phase: 'complete', operation: 'install', package: 'my-plugin', message: 'Done' };
      }
      mockRegistry.install.mockReturnValue(gen());

      const raw = await postInstall({ package: 'my-plugin' });

      expect(raw.status).toBe(200);
      expect(raw.headers.get('Content-Type')).toBe('text/event-stream');

      // Consume just the first chunk to verify event format
      const reader = raw.body?.getReader();
      expect(reader).toBeDefined();
      const { value } = await reader!.read();
      await reader!.cancel();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: progress');
    });

    test('install with version passes version to registry', async () => {
      async function* gen(): AsyncGenerator<OperationProgress> {
        yield { phase: 'complete', operation: 'install', package: 'p', targetVersion: '2.0.0' };
      }
      mockRegistry.install.mockReturnValue(gen());

      const raw = await postInstall({ package: 'my-plugin', version: '2.0.0' });

      expect(raw.status).toBe(200);
      expect(mockRegistry.install).toHaveBeenCalledWith('my-plugin', '2.0.0');
      await raw.body?.getReader().cancel();
    });

    test('install SSE stream sends error event when generator throws', async () => {
      async function* gen(): AsyncGenerator<OperationProgress> {
        throw new Error('Install failed');
      }
      mockRegistry.install.mockReturnValue(gen());

      const raw = await postInstall({ package: 'bad-plugin' });
      expect(raw.status).toBe(200);

      const reader = raw.body?.getReader();
      const { value } = await reader!.read();
      await reader!.cancel();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: progress');
      expect(text).toContain('"error"');
      expect(text).toContain('Install failed');
    });

    test('install SSE closes on error phase from generator', async () => {
      async function* gen(): AsyncGenerator<OperationProgress> {
        yield {
          phase: 'error',
          operation: 'install',
          package: 'bad-plugin',
          message: 'Not found',
          error: 'Not found',
        };
      }
      mockRegistry.install.mockReturnValue(gen());

      const raw = await postInstall({ package: 'bad-plugin' });
      expect(raw.status).toBe(200);

      const reader = raw.body?.getReader();
      const { value } = await reader!.read();
      await reader!.cancel();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('"error"');
      expect(text).toContain('Not found');
    });

    test('install calls registry.init before install', async () => {
      async function* gen(): AsyncGenerator<OperationProgress> {
        yield { phase: 'complete', operation: 'install', package: 'p' };
      }
      mockRegistry.install.mockReturnValue(gen());

      const raw = await postInstall({ package: 'p' });
      expect(raw.status).toBe(200);
      expect(mockRegistry.init).toHaveBeenCalled();
      await raw.body?.getReader().cancel();
    });
  });

  // ─── Update (SSE) ─────────────────────────────────────────────────────────

  describe('POST /api/registry/update', () => {
    function postUpdate(body: Record<string, unknown>) {
      return app.hono.fetch(
        new Request('http://test/api/registry/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
    }

    test('returns SSE stream with progress events for update', async () => {
      async function* gen(): AsyncGenerator<OperationProgress> {
        yield { phase: 'resolving', operation: 'update', package: 'my-plugin' };
        yield { phase: 'complete', operation: 'update', package: 'my-plugin', message: 'Updated' };
      }
      mockRegistry.update.mockReturnValue(gen());

      const raw = await postUpdate({ package: 'my-plugin' });

      expect(raw.status).toBe(200);
      expect(raw.headers.get('Content-Type')).toBe('text/event-stream');

      const reader = raw.body?.getReader();
      const { value } = await reader!.read();
      await reader!.cancel();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: progress');
    });

    test('update without package name calls update with undefined', async () => {
      async function* gen(): AsyncGenerator<OperationProgress> {
        yield { phase: 'complete', operation: 'update', package: 'all' };
      }
      mockRegistry.update.mockReturnValue(gen());

      const raw = await postUpdate({});

      expect(raw.status).toBe(200);
      expect(mockRegistry.update).toHaveBeenCalledWith(undefined);
      await raw.body?.getReader().cancel();
    });

    test('update SSE stream sends error event when generator throws', async () => {
      async function* gen(): AsyncGenerator<OperationProgress> {
        throw new Error('Update crashed');
      }
      mockRegistry.update.mockReturnValue(gen());

      const raw = await postUpdate({});
      expect(raw.status).toBe(200);

      const reader = raw.body?.getReader();
      const { value } = await reader!.read();
      await reader!.cancel();

      const text = new TextDecoder().decode(value);
      expect(text).toContain('"error"');
      expect(text).toContain('Update crashed');
    });

    test('update calls registry.init before update', async () => {
      async function* gen(): AsyncGenerator<OperationProgress> {
        yield { phase: 'complete', operation: 'update', package: 'all' };
      }
      mockRegistry.update.mockReturnValue(gen());

      const raw = await postUpdate({});
      expect(raw.status).toBe(200);
      expect(mockRegistry.init).toHaveBeenCalled();
      await raw.body?.getReader().cancel();
    });
  });

  // ─── Plugin README ──────────────────────────────────────────────────────

  describe('GET /api/registry/plugins/:name/readme', () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    afterEach(() => {
      fetchSpy?.mockRestore();
    });

    test('returns readme from local file when it exists', async () => {
      mockStore.getLocalPluginRoot.mockResolvedValue('/plugins/brika-plugin-timer');
      bun.fs({ '/plugins/brika-plugin-timer/README.md': '# Local Readme' }).apply();

      const res = await app.get<{ readme: string; filename: string }>(
        '/api/registry/plugins/brika-plugin-timer/readme'
      );

      expect(res.status).toBe(200);
      expect(res.body.readme).toBe('# Local Readme');
      expect(res.body.filename).toBe('README.md');
    });

    test('falls back to CDN when local file does not exist', async () => {
      mockStore.getLocalPluginRoot.mockResolvedValue('/plugins/brika-plugin-timer');
      // No README.md in the virtual fs, so Bun.file().exists() returns false
      bun.fs({}).apply();

      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('# CDN Readme', { status: 200 })
      );

      const res = await app.get<{ readme: string; filename: string }>(
        '/api/registry/plugins/brika-plugin-timer/readme'
      );

      expect(res.status).toBe(200);
      expect(res.body.readme).toBe('# CDN Readme');
      expect(res.body.filename).toBe('README.md');
    });

    test('strips source prefix for CDN URL', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('# Readme', { status: 200 })
      );

      await app.get('/api/registry/plugins/local:brika-plugin-timer/readme');

      // stripSourcePrefix should remove 'local:' prefix
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://unpkg.com/brika-plugin-timer@latest/README.md',
        { redirect: 'follow' }
      );
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

    test('returns null on fetch error and logs it', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const res = await app.get<{ readme: null; filename: null }>(
        '/api/registry/plugins/brika-plugin-timer/readme'
      );

      expect(res.status).toBe(200);
      expect(res.body.readme).toBeNull();
      expect(res.body.filename).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch README from CDN', {
        packageName: 'brika-plugin-timer',
        error: 'Error: Network error',
      });
    });
  });

  // ─── Plugin Icon ────────────────────────────────────────────────────────

  describe('GET /api/registry/plugins/:name/icon', () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    afterEach(() => {
      fetchSpy?.mockRestore();
    });

    test('returns local PNG icon when it exists', async () => {
      mockStore.getLocalPluginRoot.mockResolvedValue('/plugins/my-plugin');
      // BunMock file mock only supports exists/json/text, but the icon route
      // calls file.arrayBuffer(). We need to use spyOn for Bun.file to handle this.
      const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
        const p = String(path);
        if (p === '/plugins/my-plugin/icon.png') {
          return {
            exists: () => Promise.resolve(true),
            arrayBuffer: () => Promise.resolve(new Uint8Array([137, 80, 78, 71]).buffer),
          } as ReturnType<typeof Bun.file>;
        }
        return {
          exists: () => Promise.resolve(false),
        } as ReturnType<typeof Bun.file>;
      }) as typeof Bun.file);

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/my-plugin/icon')
      );

      expect(raw.status).toBe(200);
      expect(raw.headers.get('Content-Type')).toBe('image/png');
      expect(raw.headers.get('Cache-Control')).toBe('public, max-age=60');

      fileSpy.mockRestore();
    });

    test('returns local SVG icon with correct content-type', async () => {
      mockStore.getLocalPluginRoot.mockResolvedValue('/plugins/my-plugin');
      const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
        const p = String(path);
        // icon.png and icon.svg are the first two paths checked
        if (p === '/plugins/my-plugin/icon.svg') {
          return {
            exists: () => Promise.resolve(true),
            arrayBuffer: () => Promise.resolve(new TextEncoder().encode('<svg></svg>').buffer),
          } as ReturnType<typeof Bun.file>;
        }
        return {
          exists: () => Promise.resolve(false),
        } as ReturnType<typeof Bun.file>;
      }) as typeof Bun.file);

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/my-plugin/icon')
      );

      expect(raw.status).toBe(200);
      expect(raw.headers.get('Content-Type')).toBe('image/svg+xml');

      fileSpy.mockRestore();
    });

    test('returns local logo.png icon (third icon path)', async () => {
      mockStore.getLocalPluginRoot.mockResolvedValue('/plugins/my-plugin');
      const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
        const p = String(path);
        if (p === '/plugins/my-plugin/logo.png') {
          return {
            exists: () => Promise.resolve(true),
            arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
          } as ReturnType<typeof Bun.file>;
        }
        return {
          exists: () => Promise.resolve(false),
        } as ReturnType<typeof Bun.file>;
      }) as typeof Bun.file);

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/my-plugin/icon')
      );

      expect(raw.status).toBe(200);
      expect(raw.headers.get('Content-Type')).toBe('image/png');

      fileSpy.mockRestore();
    });

    test('falls back to CDN when local icons do not exist', async () => {
      mockStore.getLocalPluginRoot.mockResolvedValue('/plugins/my-plugin');
      const fileSpy = spyOn(Bun, 'file').mockImplementation((() => {
        return {
          exists: () => Promise.resolve(false),
        } as ReturnType<typeof Bun.file>;
      }) as typeof Bun.file);

      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      );

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/my-plugin/icon')
      );

      expect(raw.status).toBe(200);

      fileSpy.mockRestore();
    });

    test('CDN icon tries multiple paths and returns first successful', async () => {
      let callCount = 0;
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() => {
        callCount++;
        // First call (icon.png) fails, second call (icon.svg) succeeds
        if (callCount === 1) {
          return Promise.resolve(new Response(null, { status: 404 }));
        }
        return Promise.resolve(
          new Response(new TextEncoder().encode('<svg/>'), {
            status: 200,
            headers: { 'content-type': 'image/svg+xml' },
          })
        );
      });

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/my-plugin/icon')
      );

      expect(raw.status).toBe(200);
      expect(raw.headers.get('Content-Type')).toBe('image/svg+xml');
      expect(raw.headers.get('Cache-Control')).toBe('public, max-age=86400');
    });

    test('strips source prefix for CDN icon URL', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      );

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/npm:my-plugin/icon')
      );

      expect(raw.status).toBe(200);
      // Should use 'my-plugin' not 'npm:my-plugin' in the CDN URL
      expect(fetchSpy).toHaveBeenCalledWith('https://unpkg.com/my-plugin@latest/icon.png', {
        redirect: 'follow',
      });
    });

    test('returns icon when CDN has it', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      );

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/brika-plugin-timer/icon')
      );

      expect(raw.status).toBe(200);
    });

    test('returns 404 when no icon found on CDN', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/brika-plugin-timer/icon')
      );

      expect(raw.status).toBe(404);
    });

    test('returns 404 on fetch error and logs it', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/brika-plugin-timer/icon')
      );

      expect(raw.status).toBe(404);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch icon from CDN', {
        packageName: 'brika-plugin-timer',
        error: 'Error: Network error',
      });
    });

    test('CDN icon uses content-type from response when available', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        })
      );

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/my-plugin/icon')
      );

      expect(raw.status).toBe(200);
      expect(raw.headers.get('Content-Type')).toBe('image/webp');
    });

    test('CDN icon defaults to image/png when no content-type header', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(new Uint8Array([1]), { status: 200 })
      );

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/my-plugin/icon')
      );

      expect(raw.status).toBe(200);
      expect(raw.headers.get('Content-Type')).toBe('image/png');
    });

    test('no local root falls through directly to CDN', async () => {
      // getLocalPluginRoot returns null (default mock)
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      );

      const raw = await app.hono.fetch(
        new Request('http://test/api/registry/plugins/some-plugin/icon')
      );

      expect(raw.status).toBe(200);
    });
  });
});
