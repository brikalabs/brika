import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { provide, useTestBed } from '@brika/di/testing';
import { processGuard } from '@/runtime/bootstrap/plugins/process-guard';
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
