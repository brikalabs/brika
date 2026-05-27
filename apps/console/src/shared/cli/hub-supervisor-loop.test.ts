/**
 * The supervisor loop runs the hub as a child subprocess and respawns
 * it on exit-code 42 (RESTART_CODE). We don't actually fork a real
 * `brika hub` here — `Bun.spawn` is stubbed to hand back synthetic
 * subprocesses whose `.exited` resolves with a queued exit code. Each
 * test queues a finite sequence and asserts the loop spawns the right
 * number of times before returning the final code.
 *
 * Two observable behaviours we lock in:
 *   1. exit 42 → respawn (the whole reason this file exists)
 *   2. exit ≠ 42 → loop returns that code, no further spawn
 *   3. throttle: more than 5 restarts inside 60s gives up with code 1
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { runHubSupervisorLoop } from './hub-supervisor-loop';

type SpawnReturn = ReturnType<typeof Bun.spawn>;

function fakeChild(exitCode: number): SpawnReturn {
  const noop = (): void => undefined;
  const target: Record<string, unknown> = {};
  Object.defineProperties(target, {
    pid: { value: 99999, enumerable: true },
    exitCode: { value: exitCode, enumerable: true },
    signalCode: { value: null, enumerable: true },
    killed: { value: false, enumerable: true },
    stdin: { value: null, enumerable: true },
    stdout: { value: null, enumerable: true },
    stderr: { value: null, enumerable: true },
    readable: { value: null, enumerable: true },
    exited: { value: Promise.resolve(exitCode), enumerable: true },
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
  const result: unknown = target;
  return result as SpawnReturn;
}

const RESTART_CODE = 42;

describe('runHubSupervisorLoop', () => {
  let spawnSpy: ReturnType<typeof spyOn>;
  let originalRemoveListener: typeof process.off;

  beforeEach(() => {
    spawnSpy = spyOn(Bun, 'spawn');
    // Make sure the test's own SIGTERM/SIGINT bindings aren't disturbed.
    originalRemoveListener = process.off.bind(process);
  });

  afterEach(() => {
    spawnSpy.mockRestore();
    process.off = originalRemoveListener;
  });

  test('returns child exit code when hub exits with 0 (clean stop)', async () => {
    spawnSpy.mockImplementation(() => fakeChild(0));
    const result = await runHubSupervisorLoop();
    expect(result).toBe(0);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });

  test('respawns once when hub exits with RESTART_CODE then 0', async () => {
    const codes = [RESTART_CODE, 0];
    spawnSpy.mockImplementation(() => fakeChild(codes.shift() ?? 0));
    const result = await runHubSupervisorLoop();
    expect(result).toBe(0);
    expect(spawnSpy).toHaveBeenCalledTimes(2);
  });

  test('returns the non-restart code from a later child', async () => {
    const codes = [RESTART_CODE, RESTART_CODE, 137];
    spawnSpy.mockImplementation(() => fakeChild(codes.shift() ?? 0));
    const result = await runHubSupervisorLoop();
    expect(result).toBe(137);
    expect(spawnSpy).toHaveBeenCalledTimes(3);
  });

  test('gives up after 5 restarts inside the rate-limit window', async () => {
    // Always asks for restart — supervisor should bail after the
    // 5th respawn (so 6 spawns total: 1 initial + 5 retries).
    spawnSpy.mockImplementation(() => fakeChild(RESTART_CODE));
    const result = await runHubSupervisorLoop();
    expect(result).toBe(1);
    expect(spawnSpy).toHaveBeenCalledTimes(6);
  });
});
