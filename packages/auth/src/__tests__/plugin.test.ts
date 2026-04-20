/**
 * @brika/auth - Plugin Tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureDatabases } from '@brika/db';
import { container } from '@brika/di';
import { auth } from '../plugin';

const testDataDir = join(tmpdir(), `brika-test-${Date.now()}`);
configureDatabases(testDataDir);

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
    const plugin = auth();

    expect(plugin.name).toBe('auth');
    expect(typeof plugin.setup).toBe('function');
    expect(typeof plugin.onStart).toBe('function');
    expect(typeof plugin.onStop).toBe('function');
  });

  it('should register services and middleware when server is provided', () => {
    const server = createMockServer();
    const plugin = auth({
      server,
    });

    plugin.setup?.();

    expect(server.middleware.length).toBe(1);
    expect(server.routes.length).toBeGreaterThan(0);

    plugin.onStop?.();
  });

  it('should work without server (CLI mode)', () => {
    const plugin = auth();

    plugin.setup?.();
    plugin.onStop?.();
  });

  it('should go through full lifecycle', async () => {
    const plugin = auth();

    plugin.setup?.();
    plugin.onStart?.();
    plugin.onStop?.();
  });
});
