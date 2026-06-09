/**
 * Unit tests for lifecycle helpers: runHealthcheck.
 *
 * `spawnService` and `terminateService` are covered by the supervisor
 * integration tests. This file focuses on the branches inside
 * `runHealthcheck` that the integration suite doesn't reach in isolation:
 * the `tcp` probe path and the `none` fall-through.
 */
import { describe, expect, test } from 'bun:test';
import type { ServiceSpec } from '../config';
import { runHealthcheck } from './lifecycle';

function makeSpec(overrides: Partial<ServiceSpec> = {}): ServiceSpec {
  return {
    id: 'svc',
    label: 'Svc',
    command: 'echo ok',
    env: {},
    dependsOn: [],
    cwd: null,
    port: null,
    url: null,
    health: { kind: 'none' },
    ...overrides,
  };
}

describe('runHealthcheck', () => {
  test('health:none resolves immediately with null detectedPort', async () => {
    const ac = new AbortController();
    const result = await runHealthcheck(makeSpec({ health: { kind: 'none' } }), 99999, ac.signal);
    expect(result.detectedPort).toBeNull();
  });

  test('health:tcp resolves and returns the declared port when the port is open', async () => {
    // Open a real TCP listener so the healthcheck can connect.
    const server = Bun.listen({
      hostname: '127.0.0.1',
      port: 0, // OS-assigned ephemeral port
      socket: {
        data() {},
        open() {},
        close() {},
        error() {},
      },
    });
    const port = server.port;
    const ac = new AbortController();
    try {
      const result = await runHealthcheck(
        makeSpec({ health: { kind: 'tcp', port, timeoutMs: 5_000 } }),
        99999,
        ac.signal
      );
      expect(result.detectedPort).toBe(port);
    } finally {
      server.stop(true);
    }
  });

  test('health:http resolves with null detectedPort when server responds 200', async () => {
    // Spin up a minimal HTTP server to satisfy the healthcheck.
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response('ok');
      },
    });
    const port = server.port;
    const ac = new AbortController();
    try {
      const result = await runHealthcheck(
        makeSpec({
          health: {
            kind: 'http',
            url: `http://127.0.0.1:${port}/health`,
            timeoutMs: 5_000,
          },
        }),
        99999,
        ac.signal
      );
      expect(result.detectedPort).toBeNull();
    } finally {
      await server.stop();
    }
  });

  test('health:tcp rejects when the port is not listening within timeout', async () => {
    const ac = new AbortController();
    await expect(
      runHealthcheck(
        makeSpec({ health: { kind: 'tcp', port: 19999, timeoutMs: 200 } }),
        99999,
        ac.signal
      )
    ).rejects.toThrow();
  });

  test('health:tcp aborts promptly when the signal fires', async () => {
    const ac = new AbortController();
    const promise = runHealthcheck(
      makeSpec({ health: { kind: 'tcp', port: 19998, timeoutMs: 30_000 } }),
      99999,
      ac.signal
    );
    // Abort immediately; should settle well before the 30s timeout.
    ac.abort();
    await expect(promise).rejects.toThrow();
  });
});
