/**
 * Unit tests for port-detect helpers that don't require a full integration
 * setup: isPortListening, collectPidTree, listListeningPorts.
 *
 * The preflight memoization branches and waitForListeningPort happy-path
 * are covered by port-detect.integration.test.ts; this file adds targeted
 * coverage for the functions the integration suite does not reach directly.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { collectPidTree, isPortListening, listListeningPorts } from './port-detect';

// ─── isPortListening ─────────────────────────────────────────────────────────

describe('isPortListening', () => {
  test('returns true when a process is bound to the port', async () => {
    // Spin up a minimal TCP listener so lsof can see it.
    const server = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        data() {},
        open() {},
        close() {},
        error() {},
      },
    });
    const port = server.port;
    try {
      // Give the OS a moment to register the socket with lsof.
      await Bun.sleep(50);
      const result = await isPortListening(port);
      expect(result).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  test('returns false for a port that nothing is bound to', async () => {
    // Port 1 is privileged and virtually never bound outside root contexts.
    // If by chance it is bound, the test may flake — but that is
    // environmentally driven, not a code defect.
    const result = await isPortListening(1);
    expect(result).toBe(false);
  });
});

// ─── collectPidTree ──────────────────────────────────────────────────────────

describe('collectPidTree', () => {
  test('includes the root pid itself', async () => {
    const pids = await collectPidTree(process.pid);
    expect(pids).toContain(process.pid);
  });

  test('returns at least the root when the pid has no children', async () => {
    // Spawn a leaf process that does nothing but sleep.
    const proc = Bun.spawn(['bun', '-e', 'await Bun.sleep(60000)'], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    try {
      if (proc.pid === undefined) {
        throw new Error('no pid assigned');
      }
      const pids = await collectPidTree(proc.pid);
      expect(pids).toContain(proc.pid);
    } finally {
      proc.kill('SIGKILL');
    }
  });

  test('returns only the root pid when it has no children (non-existent pid)', async () => {
    // collectPidTree always includes the root pid itself; pgrep for
    // children returns nothing for a non-existent or childless pid.
    const pids = await collectPidTree(99_999_999);
    // The root is included unconditionally; no children will be appended.
    expect(pids).toEqual([99_999_999]);
  });
});

// ─── listListeningPorts ──────────────────────────────────────────────────────

describe('listListeningPorts', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    cleanups.length = 0;
  });

  afterEach(() => {
    for (const fn of cleanups) {
      fn();
    }
  });

  test('returns empty array for a non-existent pid', async () => {
    const ports = await listListeningPorts(99_999_999);
    expect(ports).toEqual([]);
  });

  test('returns sorted ports for a pid that is listening', async () => {
    const proc = Bun.spawn(
      [
        'bun',
        '-e',
        `Bun.serve({ port: 0, fetch: () => new Response('ok') }); await Bun.sleep(60000)`,
      ],
      { stdout: 'pipe', stderr: 'ignore' }
    );
    cleanups.push(() => proc.kill('SIGKILL'));

    if (proc.pid === undefined) {
      throw new Error('no pid');
    }

    // Wait for the child to bind a port by reading its stdout URL.
    // Bun.serve prints "Listening on http://localhost:PORT" to stdout
    // when the port is 0-assigned. Give it up to 5 s.
    let ports: number[] = [];
    for (let i = 0; i < 50; i++) {
      ports = await listListeningPorts(proc.pid);
      if (ports.length > 0) {
        break;
      }
      await Bun.sleep(100);
    }

    expect(ports.length).toBeGreaterThan(0);
    // Ports must be sorted ascending.
    for (let i = 1; i < ports.length; i++) {
      expect(ports[i] ?? 0).toBeGreaterThanOrEqual(ports[i - 1] ?? 0);
    }
  });
});
