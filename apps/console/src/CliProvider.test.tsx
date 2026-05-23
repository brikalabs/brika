/**
 * Unit tests for `<CliProvider>` — owns the hub-status poll loop, the
 * transient mood timeout, and the four hub-control actions exposed
 * through `useCli()`.
 *
 * Strategy: rather than `mock.module` the shared/cli helpers (which
 * leaks process-wide and breaks the sibling unit tests that exercise
 * those modules for real), we drive their real implementations:
 *
 *   - `BRIKA_HOME` → per-test tmpdir, so `checkPid` reads a pid file
 *     we write/remove ourselves to deterministically toggle running /
 *     stale / stopped.
 *   - `BRIKA_PORT` → an unbound port so `pingHub` always fails (we
 *     don't depend on whether a dev hub happens to be running locally).
 *   - `Bun.spawn` and `process.kill` are stubbed per-test with
 *     `spyOn`, so we observe what the provider dispatches without
 *     forking real processes.
 *   - `globalThis.fetch` is stubbed via `useBunMock` to control the
 *     `/api/health` probe `pingHub` makes when there's no pid file.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useBunMock } from '@brika/testing';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { CliProvider } from './CliProvider';
import { useCli } from './shared/hooks/useCli';

type CliState = ReturnType<typeof useCli>;

type SpawnReturn = ReturnType<typeof Bun.spawn>;

/** Build a fake `Bun.Subprocess`. `spawnHubDetached` only touches
 *  `.pid`, `.exitCode`, and `.unref()`. */
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
  if (!isSpawnReturn(target)) {
    throw new Error('fakeChild produced an invalid Subprocess stub');
  }
  return target;
}

function isSpawnReturn(value: unknown): value is SpawnReturn {
  if (typeof value !== 'object' || value === null || !('pid' in value)) {
    return false;
  }
  const { pid } = value;
  return typeof pid === 'number';
}

function flush(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Poll a predicate until it returns true or timeout expires. Use this instead of
// fixed flush() sleeps for assertions that must see a specific state — under
// CPU contention (e.g. `bun --filter '*' test --parallel` with many workspaces
// in flight) the React render loop can be slow enough that a fixed sleep races.
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

interface ConsumerProps {
  readonly onResult: (cli: CliState) => void;
}

function Consumer({ onResult }: Readonly<ConsumerProps>): React.ReactElement {
  const cli = useCli();
  onResult(cli);
  return React.createElement(Text, null, '.');
}

function mount(latest: { current: CliState | null }): {
  unmount: () => void;
} {
  const { unmount } = render(
    React.createElement(
      CliProvider,
      { version: '1.2.3' },
      React.createElement(Consumer, {
        onResult: (cli) => {
          latest.current = cli;
        },
      })
    )
  );
  return { unmount };
}

describe('<CliProvider>', () => {
  const bun = useBunMock();

  let home: string;
  let originalHome: string | undefined;
  let originalPort: string | undefined;
  let originalHost: string | undefined;
  const pidPath = (): string => join(home, 'brika.pid');

  const writePid = (pid: number): void => {
    writeFileSync(pidPath(), String(pid), 'utf8');
  };
  const clearPid = async (): Promise<void> => {
    await rm(pidPath(), { force: true });
  };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'brika-cli-provider-'));
    originalHome = process.env.BRIKA_HOME;
    originalPort = process.env.BRIKA_PORT;
    originalHost = process.env.BRIKA_HOST;
    process.env.BRIKA_HOME = home;
    // Unbound port so `pingHub` always returns false unless we override
    // the fetch mock below.
    process.env.BRIKA_PORT = '1';
    process.env.BRIKA_HOST = '127.0.0.1';
    // Default fetch mock: every probe fails so externally-started hubs
    // are never reported. Individual tests can override.
    bun.fetch(async (): ReturnType<typeof fetch> => {
      throw new Error('connection refused');
    });
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
    if (originalHost === undefined) {
      delete process.env.BRIKA_HOST;
    } else {
      process.env.BRIKA_HOST = originalHost;
    }
    rmSync(home, { recursive: true, force: true });
  });

  test('initial render before the first checkPid resolves is unknown/thinking', () => {
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    // The Consumer renders synchronously before the first effect tick.
    expect(latest.current?.hub.state).toBe('unknown');
    expect(latest.current?.mood).toBe('thinking');
    expect(latest.current?.statusText).toBe('checking hub…');
    expect(latest.current?.version).toBe('1.2.3');
    expect(latest.current?.workspace).toBe(home);
    unmount();
  });

  test('running hub (pid file points at this process) propagates as running', async () => {
    // `process.pid` is always alive, so checkPid returns running.
    writePid(process.pid);
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await waitFor(() => latest.current?.hub.state === 'running');
    expect(latest.current?.hub.state).toBe('running');
    if (latest.current?.hub.state === 'running') {
      expect(latest.current.hub.pid).toBe(process.pid);
    }
    unmount();
  });

  test('stopped pid yields sleep mood + "start" caption', async () => {
    await clearPid();
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);
    expect(latest.current?.hub.state).toBe('stopped');
    expect(latest.current?.mood).toBe('sleep');
    expect(latest.current?.statusText).toMatch(/start/);
    unmount();
  });

  test('stale pid (pid points at a dead PID, no health probe answer) yields suspicious mood', async () => {
    // PID 1 reliably exists on Unix but `process.kill(1, 0)` from a
    // non-root user throws EPERM, which `checkPid` treats as "running".
    // We need a PID that returns ESRCH — i.e. a definitely-gone PID.
    // We spawn a tiny noop, await its exit, and use its (now-reclaimed)
    // pid. To avoid that flakiness we instead spy on `process.kill`
    // for the `signal=0` probe and force an ESRCH error.
    writePid(424242);
    const realKill = process.kill;
    const killSpy = spyOn(process, 'kill').mockImplementation(
      (pid: number, signal?: string | number): true => {
        if (signal === 0) {
          const err = new Error('ESRCH') as NodeJS.ErrnoException;
          err.code = 'ESRCH';
          throw err;
        }
        return realKill(pid, signal);
      }
    );
    try {
      const latest: { current: CliState | null } = { current: null };
      const { unmount } = mount(latest);
      await flush(200);
      expect(latest.current?.hub.state).toBe('stale');
      expect(latest.current?.mood).toBe('suspicious');
      expect(latest.current?.statusText).toMatch(/stale pid/);
      unmount();
    } finally {
      killSpy.mockRestore();
    }
  });

  test('startHub() with stopped pid spawns and sets a happy transient mood', async () => {
    await clearPid();
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);

    // Stub Bun.spawn so the "spawned child claims the pid file" path
    // resolves quickly. Writing process.pid keeps `checkPid` happy.
    const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
      writePid(process.pid);
      return fakeChild({ pid: 5555 });
    });
    try {
      await latest.current?.startHub();
      await flush(50);
      expect(spawnSpy).toHaveBeenCalled();
      expect(latest.current?.mood).toBe('happy');
      // Either `pid 5555` (timeout path) or `pid <process.pid>` (settle
      // path) — both are happy outcomes for the user.
      expect(latest.current?.statusText).toMatch(/spawned hub|hub is up/);
    } finally {
      spawnSpy.mockRestore();
    }
    unmount();
  });

  test('startHub() when already running emits a suspicious transient mood and does not spawn', async () => {
    writePid(process.pid);
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);

    const spawnSpy = spyOn(Bun, 'spawn');
    try {
      await latest.current?.startHub();
      await flush(20);
      expect(spawnSpy).not.toHaveBeenCalled();
      expect(latest.current?.mood).toBe('suspicious');
      expect(latest.current?.statusText).toMatch(/already running/);
    } finally {
      spawnSpy.mockRestore();
    }
    unmount();
  });

  test('startHub() surfaces a spawn failure as an error mood', async () => {
    await clearPid();
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);

    const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
      throw new Error('exec missing');
    });
    try {
      await latest.current?.startHub();
      await flush(20);
      expect(latest.current?.mood).toBe('error');
      expect(latest.current?.statusText).toMatch(/exec missing/);
    } finally {
      spawnSpy.mockRestore();
    }
    unmount();
  });

  test('stopHub() sends SIGTERM to the running pid', async () => {
    writePid(process.pid);
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);

    // `process.kill(pid, 0)` is what `checkPid` uses for liveness — let
    // it through, but observe SIGTERM separately.
    const realKill = process.kill;
    const killSpy = spyOn(process, 'kill').mockImplementation(
      (pid: number, signal?: string | number): true => {
        if (signal === 0) {
          return realKill(pid, signal);
        }
        // Don't actually signal ourselves with SIGTERM!
        return true;
      }
    );
    try {
      await latest.current?.stopHub();
      await flush(20);
      const calls = killSpy.mock.calls.filter((c) => c[1] === 'SIGTERM');
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe(process.pid);
      expect(latest.current?.mood).toBe('focused');
      expect(latest.current?.statusText).toMatch(/SIGTERM/);
    } finally {
      killSpy.mockRestore();
    }
    unmount();
  });

  test('stopHub() when stopped sets a sleep mood', async () => {
    await clearPid();
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);
    await latest.current?.stopHub();
    await flush(20);
    expect(latest.current?.mood).toBe('sleep');
    expect(latest.current?.statusText).toMatch(/not running/);
    unmount();
  });

  test('stopHub() with stale pid clears the pid file and reports suspicious', async () => {
    writePid(424242);
    const realKill = process.kill;
    const killSpy = spyOn(process, 'kill').mockImplementation(
      (pid: number, signal?: string | number): true => {
        if (signal === 0) {
          const err = new Error('ESRCH') as NodeJS.ErrnoException;
          err.code = 'ESRCH';
          throw err;
        }
        return realKill(pid, signal);
      }
    );
    try {
      const latest: { current: CliState | null } = { current: null };
      const { unmount } = mount(latest);
      await flush(200);
      expect(latest.current?.hub.state).toBe('stale');
      await latest.current?.stopHub();
      await flush(20);
      expect(latest.current?.mood).toBe('suspicious');
      expect(latest.current?.statusText).toMatch(/cleared/);
      unmount();
    } finally {
      killSpy.mockRestore();
    }
  });

  test('stopHub() with running but null pid (external hub via health probe) refuses', async () => {
    // No pid file → checkPid falls through to pingHub. Override fetch
    // to make the probe succeed, which yields { state: 'running', pid: null }.
    await clearPid();
    bun.fetch(async (): Promise<Response> => new Response('ok', { status: 200 }));
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);
    expect(latest.current?.hub.state).toBe('running');

    const killSpy = spyOn(process, 'kill');
    try {
      await latest.current?.stopHub();
      await flush(20);
      // SIGTERM never sent — only the signal-0 health probe runs.
      expect(killSpy.mock.calls.some((c) => c[1] === 'SIGTERM')).toBe(false);
      expect(latest.current?.mood).toBe('suspicious');
      expect(latest.current?.statusText).toMatch(/no pid file/);
    } finally {
      killSpy.mockRestore();
    }
    unmount();
  });

  test('restartHub() sends SIGUSR1 to the running pid', async () => {
    writePid(process.pid);
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);

    const realKill = process.kill;
    const killSpy = spyOn(process, 'kill').mockImplementation(
      (pid: number, signal?: string | number): true => {
        if (signal === 0) {
          return realKill(pid, signal);
        }
        return true;
      }
    );
    try {
      await latest.current?.restartHub();
      await flush(20);
      const calls = killSpy.mock.calls.filter((c) => c[1] === 'SIGUSR1');
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe(process.pid);
      expect(latest.current?.mood).toBe('thinking');
    } finally {
      killSpy.mockRestore();
    }
    unmount();
  });

  test('restartHub() when not running reports nothing to restart', async () => {
    await clearPid();
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);
    await latest.current?.restartHub();
    await flush(20);
    expect(latest.current?.mood).toBe('sleep');
    expect(latest.current?.statusText).toMatch(/nothing to restart/);
    unmount();
  });

  test('restartHub() with externally-started hub (pid=null) refuses', async () => {
    await clearPid();
    bun.fetch(async (): Promise<Response> => new Response('ok', { status: 200 }));
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);
    expect(latest.current?.hub.state).toBe('running');
    await latest.current?.restartHub();
    await flush(20);
    expect(latest.current?.mood).toBe('suspicious');
    expect(latest.current?.statusText).toMatch(/can't restart/);
    unmount();
  });

  test('openUi() opens the browser at the hub URL when running', async () => {
    writePid(process.pid);
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);

    const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => fakeChild());
    try {
      await latest.current?.openUi();
      await flush(20);
      expect(spawnSpy).toHaveBeenCalled();
      const cmd = spawnSpy.mock.calls[0]?.[0];
      // `openBrowser` builds [browserCommand(), url] — the second arg
      // is the URL. We don't pin host, just that it's a hub URL.
      const argv = Array.isArray(cmd) ? cmd : [];
      expect(argv[1]).toMatch(/^http:\/\//);
      expect(latest.current?.mood).toBe('excited');
      expect(latest.current?.statusText).toMatch(/opening/);
    } finally {
      spawnSpy.mockRestore();
    }
    unmount();
  });

  test('openUi() when not running emits a sleep mood and does not open the browser', async () => {
    await clearPid();
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);

    const spawnSpy = spyOn(Bun, 'spawn');
    try {
      await latest.current?.openUi();
      await flush(20);
      expect(spawnSpy).not.toHaveBeenCalled();
      expect(latest.current?.mood).toBe('sleep');
      expect(latest.current?.statusText).toMatch(/isn't running/);
    } finally {
      spawnSpy.mockRestore();
    }
    unmount();
  });

  test('transient mood auto-clears back to the default after 2.5s', async () => {
    await clearPid();
    const latest: { current: CliState | null } = { current: null };
    const { unmount } = mount(latest);
    await flush(150);

    // Trigger a transient: openUi while stopped sets a distinctive caption.
    await latest.current?.openUi();
    await flush(50);
    expect(latest.current?.statusText).toMatch(/isn't running/);

    // Wait past the 2.5s transient timeout — the caption should drift
    // back to the default for the stopped hub.
    await flush(2700);
    expect(latest.current?.statusText).not.toMatch(/isn't running/);
    expect(latest.current?.mood).toBe('sleep');
    unmount();
  });
});
