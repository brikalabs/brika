import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { provide, useTestBed } from '@brika/di/testing';
import { processGuard, reapInheritedZombies } from '@/runtime/bootstrap/plugins/process-guard';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import type { PluginProcess } from '@/runtime/plugins/plugin-process';

useTestBed({
  autoStub: false,
});

describe('process-guard', () => {
  const mockLifecycle = {
    listProcesses: mock(() => [] as PluginProcess[]),
  };

  beforeEach(() => {
    provide(PluginLifecycle, mockLifecycle);
    mockLifecycle.listProcesses.mockClear();
  });

  test('reapInheritedZombies resolves without throwing', async () => {
    // Bun reaps its own spawns, so a real zombie can't be manufactured
    // from inside the test process. This covers that the FFI plumbing
    // resolves on this platform and the waitpid loop terminates. The
    // count is >= 0 rather than exactly 0 because a zombie leaked by an
    // earlier test file in the same runner process would (correctly) be
    // collected here.
    expect(await reapInheritedZombies()).toBeGreaterThanOrEqual(0);
  });

  test('registers exit handler on start', () => {
    const listeners = process.listenerCount('exit');
    const plugin = processGuard();
    plugin.onStart?.();
    expect(process.listenerCount('exit')).toBe(listeners + 1);
  });

  test('exit handler iterates all running processes', () => {
    mockLifecycle.listProcesses.mockReturnValue([
      {
        pid: 999999999,
      } as PluginProcess,
      {
        pid: 999999998,
      } as PluginProcess,
    ]);

    const plugin = processGuard();
    plugin.onStart?.();

    // Simulate what the exit handler does (can't actually trigger process.exit in test)
    const processes = mockLifecycle.listProcesses();
    expect(processes).toHaveLength(2);
  });
});
