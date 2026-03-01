/**
 * Tests for cli/utils/supervisor.ts — startBackground and runSupervisor.
 *
 * We avoid mock.module (Bun bug #12823). We only mock Bun.spawn (via spyOn)
 * because applying the full BunMock (Bun.file, etc.) breaks picocolors'
 * color detection which uses Bun.file(fd).writer() internally.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

// ─── Shared spawn mock helper ────────────────────────────────────────────────

interface SpawnCall {
  cmd: string[];
  options?: unknown;
}

function createSpawnMock(exitCode = 0) {
  const calls: SpawnCall[] = [];

  const spy = spyOn(Bun, 'spawn').mockImplementation(((cmd: unknown, options?: unknown) => {
    const cmdArray = Array.isArray(cmd)
      ? (cmd as string[])
      : [
          String(cmd),
        ];
    calls.push({
      cmd: cmdArray,
      options,
    });
    return {
      pid: 12345,
      stdin: null,
      stdout: null,
      stderr: null,
      exited: Promise.resolve(exitCode),
      exitCode: null,
      signalCode: null,
      killed: false,
      kill: () => {},
      ref: () => {},
      unref: () => {},
      resourceUsage: () => null,
    } as unknown as ReturnType<typeof Bun.spawn>;
  }) as typeof Bun.spawn);

  return {
    spy,
    calls,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('cli/utils/supervisor', () => {
  // ─── startBackground ──────────────────────────────────────────────────────

  describe('startBackground', () => {
    let exitSpy: ReturnType<typeof spyOn>;
    let logSpy: ReturnType<typeof spyOn>;
    let spawnSpy: ReturnType<typeof spyOn>;
    let spawnCalls: SpawnCall[];

    beforeEach(() => {
      exitSpy = spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('__EXIT__');
      }) as never);
      logSpy = spyOn(console, 'log').mockImplementation(() => {});
      const mock = createSpawnMock(0);
      spawnSpy = mock.spy;
      spawnCalls = mock.calls;
    });

    afterEach(() => {
      exitSpy.mockRestore();
      logSpy.mockRestore();
      spawnSpy.mockRestore();
    });

    test('spawns detached child and exits 0', async () => {
      const { startBackground } = await import('@/cli/utils/supervisor');

      try {
        startBackground();
      } catch (e) {
        if (!(e instanceof Error && e.message === '__EXIT__')) {
          throw e;
        }
      }

      expect(spawnCalls.length).toBeGreaterThanOrEqual(1);
      const firstCall = spawnCalls[0];
      expect(firstCall?.cmd).toContain('start');
      expect(firstCall?.cmd).toContain('--foreground');
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    test('prints PID and stop instructions', async () => {
      const { startBackground } = await import('@/cli/utils/supervisor');

      try {
        startBackground();
      } catch (e) {
        if (!(e instanceof Error && e.message === '__EXIT__')) {
          throw e;
        }
      }

      expect(logSpy).toHaveBeenCalledTimes(2);
      const firstArg = String(logSpy.mock.calls[0]?.[0]);
      expect(firstArg).toContain('Started');
      const secondArg = String(logSpy.mock.calls[1]?.[0]);
      expect(secondArg).toContain('brika stop');
    });

    test('opens browser when open=true', async () => {
      const { startBackground } = await import('@/cli/utils/supervisor');

      try {
        startBackground(true);
      } catch (e) {
        if (!(e instanceof Error && e.message === '__EXIT__')) {
          throw e;
        }
      }

      // First spawn is detached hub, second is browser open
      expect(spawnCalls.length).toBe(2);
      const openCmd = spawnCalls[1]?.cmd;
      expect(openCmd?.some((c) => c.includes('http'))).toBe(true);
    });

    test('does not open browser when open=false (default)', async () => {
      const { startBackground } = await import('@/cli/utils/supervisor');

      try {
        startBackground(false);
      } catch (e) {
        if (!(e instanceof Error && e.message === '__EXIT__')) {
          throw e;
        }
      }

      // Only the detached hub spawn — no browser open
      expect(spawnCalls.length).toBe(1);
    });
  });

  // ─── runSupervisor ────────────────────────────────────────────────────────

  describe('runSupervisor', () => {
    let exitSpy: ReturnType<typeof spyOn>;
    let logSpy: ReturnType<typeof spyOn>;
    let errorSpy: ReturnType<typeof spyOn>;
    let spawnSpy: ReturnType<typeof spyOn>;
    let spawnCalls: SpawnCall[];

    beforeEach(() => {
      exitSpy = spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('__EXIT__');
      }) as never);
      logSpy = spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const mock = createSpawnMock(0);
      spawnSpy = mock.spy;
      spawnCalls = mock.calls;
    });

    afterEach(() => {
      exitSpy.mockRestore();
      logSpy.mockRestore();
      errorSpy.mockRestore();
      spawnSpy.mockRestore();
    });

    test('exits with error when pid file indicates already running', async () => {
      const { claimPidFile, removePidFile } = await import('@/cli/utils/pid');

      // Ensure pid file is claimed for our own process
      await removePidFile();
      await claimPidFile(); // writes process.pid

      const { runSupervisor } = await import('@/cli/utils/supervisor');

      try {
        await runSupervisor();
      } catch (e) {
        if (!(e instanceof Error && e.message === '__EXIT__')) {
          throw e;
        }
      }

      expect(errorSpy).toHaveBeenCalled();
      const errMsg = String(errorSpy.mock.calls[0]?.[0]);
      expect(errMsg).toContain('already running');
      expect(exitSpy).toHaveBeenCalledWith(1);

      await removePidFile();
    });

    test('spawns hub child and exits cleanly on exit code 0', async () => {
      const { removePidFile } = await import('@/cli/utils/pid');
      await removePidFile();

      const { runSupervisor } = await import('@/cli/utils/supervisor');
      await runSupervisor();

      // Hub was spawned at least once
      expect(spawnCalls.length).toBeGreaterThanOrEqual(1);
      const hubCmd = spawnCalls[0]?.cmd;
      expect(hubCmd).toContain('start');
      expect(hubCmd).toContain('--foreground');

      await removePidFile();
    });

    test('opens browser when open=true', async () => {
      const { removePidFile } = await import('@/cli/utils/pid');
      await removePidFile();

      const { runSupervisor } = await import('@/cli/utils/supervisor');
      await runSupervisor(true);

      // Second spawn call is the browser open
      expect(spawnCalls.length).toBe(2);
      const openCmd = spawnCalls[1]?.cmd;
      expect(openCmd?.some((c) => c.includes('http'))).toBe(true);

      await removePidFile();
    });

    test('does not open browser when open=false', async () => {
      const { removePidFile } = await import('@/cli/utils/pid');
      await removePidFile();

      const { runSupervisor } = await import('@/cli/utils/supervisor');
      await runSupervisor(false);

      // Only hub spawn, no browser
      expect(spawnCalls.length).toBe(1);

      await removePidFile();
    });

    test('registers SIGTERM handler that kills child', async () => {
      const { removePidFile } = await import('@/cli/utils/pid');
      await removePidFile();

      const { runSupervisor } = await import('@/cli/utils/supervisor');
      await runSupervisor();

      const sigTermListeners = process.listeners('SIGTERM');
      expect(sigTermListeners.length).toBeGreaterThan(0);

      await removePidFile();
    });

    test('registers SIGINT handler that kills child', async () => {
      const { removePidFile } = await import('@/cli/utils/pid');
      await removePidFile();

      const { runSupervisor } = await import('@/cli/utils/supervisor');
      await runSupervisor();

      const sigIntListeners = process.listeners('SIGINT');
      expect(sigIntListeners.length).toBeGreaterThan(0);

      await removePidFile();
    });

    test('registers SIGUSR1 handler for restart', async () => {
      const { removePidFile } = await import('@/cli/utils/pid');
      await removePidFile();

      const { runSupervisor } = await import('@/cli/utils/supervisor');
      await runSupervisor();

      const sigUsr1Listeners = process.listeners('SIGUSR1');
      expect(sigUsr1Listeners.length).toBeGreaterThan(0);

      await removePidFile();
    });

    test('sets BRIKA_SUPERVISOR_PID env in spawned child', async () => {
      const { removePidFile } = await import('@/cli/utils/pid');
      await removePidFile();

      const { runSupervisor } = await import('@/cli/utils/supervisor');
      await runSupervisor();

      const firstCall = spawnCalls[0];
      const options = firstCall?.options as Record<string, unknown> | undefined;
      const env = options?.env as Record<string, string> | undefined;
      expect(env?.BRIKA_SUPERVISOR_PID).toBe(String(process.pid));

      await removePidFile();
    });
  });

  // ─── RESTART_CODE constant ────────────────────────────────────────────────

  describe('RESTART_CODE', () => {
    test('is exported as 42', async () => {
      const { RESTART_CODE } = await import('@/cli/utils/runtime');
      expect(RESTART_CODE).toBe(42);
    });
  });
});
