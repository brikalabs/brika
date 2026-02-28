/**
 * @brika/auth - Plugin Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { container } from '@brika/di';
import { auth } from '../plugin';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testDataDir = join(tmpdir(), 'brika-test-' + Date.now());

/** Stub server that records middleware and routes */
function createMockServer() {
  const middleware: unknown[] = [];
  const routes: unknown[] = [];
  return {
    addMiddleware(mw: unknown) {
      middleware.push(mw);
    },
    addRoutes(r: unknown[]) {
      routes.push(...r);
    },
    middleware,
    routes,
  };
}

describe('Auth Plugin', () => {
  beforeEach(() => {
    container.clearInstances();
  });

  it('should create a bootstrap plugin', () => {
    const plugin = auth({ dataDir: testDataDir });

    expect(plugin.name).toBe('auth');
    expect(typeof plugin.setup).toBe('function');
    expect(typeof plugin.onStart).toBe('function');
    expect(typeof plugin.onStop).toBe('function');
  });

  it('should register services and middleware when server is provided', () => {
    const server = createMockServer();
    const plugin = auth({ dataDir: testDataDir, server });

    plugin.setup?.();

    expect(server.middleware.length).toBe(1);
    expect(server.routes.length).toBeGreaterThan(0);

    plugin.onStop?.();
  });

  it('should work without server (CLI mode)', () => {
    const plugin = auth({ dataDir: testDataDir });

    plugin.setup?.();
    plugin.onStop?.();
  });

  it('should go through full lifecycle', async () => {
    const plugin = auth({ dataDir: testDataDir });

    plugin.setup?.();
    await plugin.onStart?.();
    plugin.onStop?.();
  });
});
