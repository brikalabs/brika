/**
 * Tests for per-capability granular consent routes
 * (`/api/plugins/:uid/capabilities[/:capId]` and `/api/plugins/preview`).
 */
import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { provide, stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { useBunMock } from '@brika/testing';
import { pluginsRoutes } from '@/runtime/http/routes/plugins';
import { ModuleCompiler } from '@/runtime/modules';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { StateStore } from '@/runtime/state/state-store';

const PLUGIN = {
  uid: 'plg-cap-1',
  name: '@brika/plugin-test',
  capabilities: {
    'dev.brika.net.fetch': { allow: ['api.spotify.com'] },
    'dev.brika.secrets.get': {},
  },
  pages: [],
};

interface CapabilityRow {
  id: string;
  title: string;
  family: string | null;
  requestedScope: unknown;
  grantedScope: unknown | null;
  ui: { kind: string };
}

/**
 * Minimal in-memory StateStore for the route under test. Uses `provide()`
 * rather than `stub()` because the deep-stub proxy intercepts plain-object
 * returns and breaks `Object.keys` / `Object.hasOwn` on the grant map.
 */
class FakeStateStore {
  grants: Record<string, unknown> = {};
  getGrantedCapabilities = mock((_name: string) => ({ ...this.grants }));
  setGrantedCapability = mock((_name: string, capId: string, scope: unknown) => {
    this.grants[capId] = scope;
  });
  setGrantedCapabilities = mock((_name: string, next: Record<string, unknown>) => {
    this.grants = { ...next };
  });
  revokeCapability = mock((_name: string, capId: string) => {
    delete this.grants[capId];
  });
}

describe('per-capability consent routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let state: FakeStateStore;
  let mockManager: { get: ReturnType<typeof mock> };

  useTestBed(() => {
    state = new FakeStateStore();
    mockManager = {
      get: mock().mockReturnValue(PLUGIN),
    };
    stub(PluginManager, mockManager);
    provide(StateStore, state as unknown as StateStore);
    stub(ModuleCompiler, { get: mock().mockReturnValue(null) });
    stub(PluginLifecycle, { getProcess: mock().mockReturnValue(null) });
    app = TestApp.create(pluginsRoutes);
  });

  // ─── GET /:uid/capabilities ─────────────────────────────────────────────

  test('GET returns one row per manifest capability with title + ui hint', async () => {
    const res = await app.get<{ capabilities: CapabilityRow[] }>(
      `/api/plugins/${PLUGIN.uid}/capabilities`
    );
    expect(res.status).toBe(200);
    expect(res.body.capabilities).toHaveLength(2);

    const net = res.body.capabilities.find((c) => c.id === 'dev.brika.net.fetch');
    expect(net).toBeDefined();
    expect(net?.title).toBe('Make HTTP requests');
    expect(net?.family).toBe('net');
    expect(net?.requestedScope).toEqual({ allow: ['api.spotify.com'] });
    expect(net?.grantedScope).toBeNull();
    expect(net?.ui.kind).toBe('string-array');
  });

  // ─── PUT /:uid/capabilities/:capId ───────────────────────────────────────

  test('PUT writes the validated scope and returns the updated row', async () => {
    const res = await app.put<{ capability: CapabilityRow }>(
      `/api/plugins/${PLUGIN.uid}/capabilities/dev.brika.net.fetch`,
      { scope: { allow: ['api.weather.com'] } }
    );
    expect(res.status).toBe(200);
    expect(res.body.capability.grantedScope).toEqual({ allow: ['api.weather.com'] });
    expect(state.setGrantedCapability).toHaveBeenCalledWith(PLUGIN.name, 'dev.brika.net.fetch', {
      allow: ['api.weather.com'],
    });
  });

  test('PUT rejects a scope that fails the capability spec', async () => {
    const res = await app.put(`/api/plugins/${PLUGIN.uid}/capabilities/dev.brika.net.fetch`, {
      scope: { allow: 'not-an-array' },
    });
    expect(res.status).toBe(400);
    expect(state.setGrantedCapability).not.toHaveBeenCalled();
  });

  test('PUT rejects an unknown capability id', async () => {
    const res = await app.put(`/api/plugins/${PLUGIN.uid}/capabilities/com.bogus.thing`, {
      scope: {},
    });
    expect(res.status).toBe(400);
  });

  // ─── DELETE /:uid/capabilities/:capId ────────────────────────────────────

  test('DELETE revokes a single capability', async () => {
    state.grants = { 'dev.brika.net.fetch': { allow: ['x'] } };
    const res = await app.delete(`/api/plugins/${PLUGIN.uid}/capabilities/dev.brika.net.fetch`);
    expect(res.status).toBe(200);
    expect(state.revokeCapability).toHaveBeenCalledWith(PLUGIN.name, 'dev.brika.net.fetch');
  });

  // ─── POST /:uid/capabilities (bulk) ──────────────────────────────────────

  test('POST validates every scope and writes the batch atomically', async () => {
    const res = await app.post<{ capabilities: CapabilityRow[] }>(
      `/api/plugins/${PLUGIN.uid}/capabilities`,
      {
        grants: {
          'dev.brika.net.fetch': { allow: ['api.example.com'] },
          'dev.brika.secrets.get': {},
        },
      }
    );
    expect(res.status).toBe(200);
    expect(state.setGrantedCapabilities).toHaveBeenCalledTimes(1);
    expect(state.setGrantedCapabilities).toHaveBeenCalledWith(PLUGIN.name, {
      'dev.brika.net.fetch': { allow: ['api.example.com'] },
      'dev.brika.secrets.get': {},
    });
  });

  test('POST rejects the whole batch when any scope is invalid', async () => {
    const res = await app.post(`/api/plugins/${PLUGIN.uid}/capabilities`, {
      grants: {
        'dev.brika.net.fetch': { allow: 'bad' },
        'dev.brika.secrets.get': {},
      },
    });
    expect(res.status).toBe(400);
    expect(state.setGrantedCapabilities).not.toHaveBeenCalled();
  });
});

// ─── GET /preview ─────────────────────────────────────────────────────────

describe('GET /api/plugins/preview', () => {
  let app: ReturnType<typeof TestApp.create>;
  const bun = useBunMock();

  useTestBed(() => {
    stub(PluginManager, { get: mock().mockReturnValue(null) });
    stub(StateStore, { getGrantedCapabilities: mock().mockReturnValue({}) });
    stub(ModuleCompiler, { get: mock().mockReturnValue(null) });
    stub(PluginLifecycle, { getProcess: mock().mockReturnValue(null) });
    app = TestApp.create(pluginsRoutes);
  });

  test('returns capability rows derived from the remote package.json', async () => {
    bun.fetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            name: '@example/plugin',
            version: '1.2.3',
            main: './dist/index.js',
            description: 'Example plugin',
            engines: { brika: '^0.3.0' },
            capabilities: {
              'dev.brika.net.fetch': { allow: ['api.example.com'] },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const res = await app.get<{
      name: string;
      version: string;
      capabilities: CapabilityRow[];
    }>('/api/plugins/preview?package=%40example%2Fplugin&version=1.2.3');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('@example/plugin');
    expect(res.body.version).toBe('1.2.3');
    expect(res.body.capabilities).toHaveLength(1);
    expect(res.body.capabilities[0]?.id).toBe('dev.brika.net.fetch');
    expect(res.body.capabilities[0]?.grantedScope).toEqual({ allow: ['api.example.com'] });
  });

  test('returns 404 when npm reports the package missing', async () => {
    bun.fetch(() => Promise.resolve(new Response('not found', { status: 404 })));

    const res = await app.get('/api/plugins/preview?package=%40example%2Fbogus&version=1.0.0');
    expect(res.status).toBe(404);
  });

  test('returns 503 when the npm registry call throws', async () => {
    bun.fetch(() => Promise.reject(new Error('ENETUNREACH')));

    const res = await app.get('/api/plugins/preview?package=%40example%2Fdown&version=1.0.0');
    expect(res.status).toBe(503);
  });
});
