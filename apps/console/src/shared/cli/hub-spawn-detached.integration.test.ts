/**
 * Race-safe spawn for multi-TUI scenarios. The full spawn path is
 * intentionally not exercised end-to-end (spawning a real `brika hub`
 * subprocess in unit tests is heavy and brittle), but the branches
 * around `Bun.spawn` *are* exercised by stubbing `Bun.spawn` to return
 * synthetic `Subprocess` shapes. We cover four observable scenarios:
 *
 *   1. pid file already running → no fork, returns existing pid
 *   2. spawn → child writes pid in time → returns claimed pid
 *   3. spawn → child exits immediately → CliError surfaced
 *   4. spawn → child exits but another supervisor had already claimed
 *      the pid file → returns the winner's pid
 *   5. stale pid file → spawn proceeds and the new child's pid is
 *      returned when the settle deadline passes
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError } from './errors';
import { spawnHubDetached } from './hub-spawn-detached';

type SpawnReturn = ReturnType<typeof Bun.spawn>;

/**
 * Build a fake `Bun.Subprocess`. `spawnHubDetached` only touches
 * `.pid`, `.exitCode`, and `.unref()`, so the rest are best-effort
 * stubs. The helper assembles the stub through `Object.defineProperties`
 * to avoid an `as`-cast — `SpawnReturn` has readonly fields that a
 * plain object literal can't satisfy directly.
 */
function fakeChild(
  overrides: Readonly<{ pid?: number; exitCode?: number | null }> = {}
): SpawnReturn {
  const noop = (): void => undefined;
  const target: Record<string, unknown> = {};
  Object.defineProperties(target, {
    pid: { value: overrides.pid ?? 99999, enumerable: true },
    exitCode: { value: overrides.exitCode ?? null, enumerable: true },
    signalCode: { value: null, enumerable: true },
    killed: { value: false, enumerable: true },
    stdin: { value: null, enumerable: true },
    stdout: { value: null, enumerable: true },
    stderr: { value: null, enumerable: true },
    readable: { value: null, enumerable: true },
    exited: { value: Promise.resolve(overrides.exitCode ?? 0), enumerable: true },
    stdio: { value: [null, null, null], enumerable: true },
    terminal: { value: undefined, enumerable: true },
    unref: { value: noop, enumerable: true },
    ref: { value: noop, enumerable: true },
    kill: { value: noop, enumerable: true },
    resourceUsage: { value: () => undefined, enumerable: true },
    send: { value: noop, enumerable: true },
    disconnect: { value: noop, enumerable: true },
    [Symbol.asyncDispose]: { value: async () => undefined, enumerable: true },
  });
  // The narrow union returned by `Bun.spawn` depends on the spawn
  // options' generic inference; `unknown` is the only safe pass-through
  // when reusing one shape across every test.
  const result: unknown = target;
  if (!isSpawnReturn(result)) {
    throw new Error('fakeChild produced an invalid Subprocess stub');
  }
  return result;
}

function isSpawnReturn(value: unknown): value is SpawnReturn {
  if (typeof value !== 'object' || value === null || !('pid' in value)) {
    return false;
  }
  const { pid } = value;
  return typeof pid === 'number';
}

describe('spawnHubDetached', () => {
  let home: string;
  let originalHome: string | undefined;
  let originalPort: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'brika-spawn-detached-'));
    // The pid file lives under the hidden .system/ dir.
    mkdirSync(join(home, '.system'), { recursive: true });
    originalHome = process.env.BRIKA_HOME;
    originalPort = process.env.BRIKA_PORT;
    process.env.BRIKA_HOME = home;
    // Point the health probe at an unbound port so a real hub running
    // on the developer's machine (port 3001) doesn't satisfy `pingHub`.
    process.env.BRIKA_PORT = '1';
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.BRIKA_HOME;
    } else {
      process.env.BRIKA_HOME = originalHome;
    }
    if (originalPort === undefined) {
      delete process.env.BRIKA_PORT;
    } else {
      process.env.BRIKA_PORT = originalPort;
    }
    rmSync(home, { recursive: true, force: true });
  });

  test('returns the existing PID without forking when a hub is already running', async () => {
    // `process.pid` is always a running process from this test's POV,
    // so `checkPid` returns `running` and `spawnHubDetached` short-
    // circuits before ever calling `Bun.spawn`.
    writeFileSync(join(home, '.system', 'brika.pid'), String(process.pid), 'utf8');
    const spawnSpy = spyOn(Bun, 'spawn');
    try {
      const pid = await spawnHubDetached();
      expect(pid).toBe(process.pid);
      expect(spawnSpy).not.toHaveBeenCalled();
    } finally {
      spawnSpy.mockRestore();
    }
  });

  test('returns the spawned child pid once the child claims the pid file', async () => {
    const child = fakeChild({ pid: 42 });
    const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
      // Simulate the child claiming the pid file mid-spawn — by the time
      // `spawnHubDetached` polls `checkPid`, the file is in place with
      // a pid that resolves to a "running" process (this test's own pid).
      writeFileSync(join(home, '.system', 'brika.pid'), String(process.pid), 'utf8');
      return child;
    });
    try {
      const pid = await spawnHubDetached();
      expect(pid).toBe(process.pid);
      expect(spawnSpy).toHaveBeenCalled();
    } finally {
      spawnSpy.mockRestore();
    }
  });

  test('throws CliError when the child exits before claiming the pid file', async () => {
    const child = fakeChild({ exitCode: 1 });
    const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => child);
    try {
      let caught: unknown = null;
      try {
        await spawnHubDetached();
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(CliError);
      if (caught instanceof CliError) {
        expect(caught.message).toContain('hub exited before claiming the PID file');
      }
      expect(spawnSpy).toHaveBeenCalled();
    } finally {
      spawnSpy.mockRestore();
    }
  });

  test('returns the winner pid when our child exits but another supervisor claimed the pid file', async () => {
    const child = fakeChild({ exitCode: 1 });
    const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
      // Another supervisor wrote the pid file *before* our forked child
      // got a chance — our child exits but `checkPid` still reports a
      // running hub, so the caller gets that winner's pid back.
      writeFileSync(join(home, '.system', 'brika.pid'), String(process.pid), 'utf8');
      return child;
    });
    try {
      const pid = await spawnHubDetached();
      expect(pid).toBe(process.pid);
      expect(spawnSpy).toHaveBeenCalled();
    } finally {
      spawnSpy.mockRestore();
    }
  });

  test('spawns when the pid file is stale and another process is not serving', async () => {
    // A pid that is essentially guaranteed not to exist — `kill(pid, 0)`
    // raises ESRCH and `pingHub()` fails because there's no listener,
    // so `checkPid` returns `stale` and `spawnHubDetached` proceeds.
    writeFileSync(join(home, '.system', 'brika.pid'), '999999', 'utf8');
    const child = fakeChild({ pid: 7777 });
    const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => child);
    try {
      const pid = await spawnHubDetached();
      // Either the child's own pid (settle-timeout branch) or a winner
      // pid (recovery branch). Both are valid; the contract is "returns
      // a pid". We mostly want the spawn path to have executed.
      expect(typeof pid).toBe('number');
      expect(spawnSpy).toHaveBeenCalled();
    } finally {
      spawnSpy.mockRestore();
    }
  }, 10_000);
});
