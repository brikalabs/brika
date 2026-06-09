/**
 * Tests for the RSS soft-limit branch in PluginProcess#startHeartbeat.
 *
 * The heartbeat samples `getProcessMetrics(pid)` and feeds RSS into the
 * per-process RssSoftLimitMonitor. A sustained breach fires
 * `onRssSoftLimitBreached` exactly once. The real `getProcessMetrics` shells
 * out to `ps` and returns null for the fake pid used in tests, so this file
 * mocks `@/runtime/metrics` to return a controllable RSS while keeping the
 * real RssSoftLimitMonitor + MetricsStore (avoids mock.module bleed by living
 * in its own file).
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { PluginPackageSchema } from '@brika/schema';
import { waitFor } from '@brika/testing';
import { MetricsStore } from '@/runtime/metrics/metrics-store';
import { RssSoftLimitMonitor } from '@/runtime/metrics/rss-soft-limit';

const MB = 1024 * 1024;

// Controllable RSS the mocked getProcessMetrics returns each sample.
let mockRssBytes = 0;

mock.module('@/runtime/metrics', () => ({
  MetricsStore,
  RssSoftLimitMonitor,
  getProcessMetrics: mock().mockImplementation(async () => ({
    cpu: 1,
    memory: mockRssBytes,
    ts: Date.now(),
  })),
}));

const { PluginProcess } = await import('@/runtime/plugins/plugin-process');
type PluginProcessType = InstanceType<typeof PluginProcess>;
type PluginProcessCallbacks = ConstructorParameters<typeof PluginProcess>[3];
type PluginProcessConfig = ConstructorParameters<typeof PluginProcess>[2];

const createMockMetadata = (): PluginPackageSchema => ({
  name: '@test/plugin',
  version: '1.0.0',
  main: './index.js',
  engines: { brika: '^0.1.0' },
});

const TEST_FS_DIRS = {
  bundle: '/path/to/plugin',
  data: '/path/to/plugin-data/data',
  cache: '/path/to/plugin-data/cache',
  tmp: '/path/to/plugin-data/tmp',
};

describe('PluginProcess RSS soft-limit heartbeat branch', () => {
  let mockChannel: {
    pid: number;
    call: ReturnType<typeof mock>;
    send: ReturnType<typeof mock>;
    on: ReturnType<typeof mock>;
    implement: ReturnType<typeof mock>;
    ping: ReturnType<typeof mock>;
    stop: ReturnType<typeof mock>;
    kill: ReturnType<typeof mock>;
  };
  let callbacks: PluginProcessCallbacks;
  let processes: PluginProcessType[];

  function makeProcess(config: PluginProcessConfig): PluginProcessType {
    const p = new PluginProcess(
      mockChannel as never,
      {
        name: '@test/plugin',
        rootDirectory: '/path/to/plugin',
        entryPoint: '/path/to/plugin/index.js',
        uid: 'uid-rss',
        version: '1.0.0',
        metadata: createMockMetadata(),
        locales: [],
        fsDirs: TEST_FS_DIRS,
      },
      config,
      callbacks
    );
    processes.push(p);
    return p;
  }

  beforeEach(() => {
    mockRssBytes = 0;
    processes = [];
    mockChannel = {
      pid: 4242,
      call: mock().mockResolvedValue({ ok: true }),
      send: mock(),
      on: mock(),
      implement: mock(),
      ping: mock().mockResolvedValue(undefined),
      stop: mock(),
      kill: mock(),
    };
    callbacks = {
      onReady: mock(),
      onLog: mock(),
      onCapture: mock(),
      onBlock: mock(),
      onBlockEmit: mock(),
      onBlockLog: mock(),
      onSpark: mock(),
      onSparkEmit: mock(),
      onSparkSubscribe: mock().mockReturnValue(() => undefined),
      onSparkUnsubscribe: mock(),
      onBrickType: mock(),
      onBrickDataPush: mock(),
      onRegisterTool: mock(),
      onInvokeTool: mock().mockResolvedValue({ ok: true }),
      onListTools: mock().mockReturnValue([]),
      onGetHubLocation: mock().mockReturnValue(null),
      onGetHubTimezone: mock().mockReturnValue(null),
      onGetGrantedPermissions: mock().mockReturnValue([]),
      onHeartbeatFailed: mock(),
      onDisconnect: mock(),
      onMetrics: mock(),
      onRoute: mock(),
      onUpdatePreference: mock(),
      onGetPluginSecret: mock().mockResolvedValue(null),
      onSetPluginSecret: mock().mockResolvedValue(undefined),
      onDeletePluginSecret: mock().mockResolvedValue(false),
      onRssSoftLimitBreached: mock(),
    };
  });

  afterEach(() => {
    for (const p of processes) {
      p.stop();
    }
  });

  test('fires onRssSoftLimitBreached once after a sustained over-limit breach', async () => {
    mockRssBytes = 600 * MB; // always over the 512 MiB limit
    const onBreached = callbacks.onRssSoftLimitBreached as ReturnType<typeof mock>;

    makeProcess({
      heartbeatIntervalMs: 20,
      heartbeatTimeoutMs: 1000,
      rssSoftLimitBytes: 512 * MB,
      rssBreachSamples: 2,
    });

    await waitFor(() => onBreached.mock.calls.length > 0, { timeoutMs: 2000 });

    const [, rssBytes, limitBytes] = onBreached.mock.calls[0];
    expect(rssBytes).toBe(600 * MB);
    expect(limitBytes).toBe(512 * MB);

    // Latches: the monitor reports a breach exactly once per process so the
    // lifecycle issues a single restart request even if RSS stays high.
    const callsAfterFirst = onBreached.mock.calls.length;
    expect(callsAfterFirst).toBe(1);
  });

  test('does not fire when RSS stays under the limit', async () => {
    mockRssBytes = 100 * MB; // well under the limit
    const onBreached = callbacks.onRssSoftLimitBreached as ReturnType<typeof mock>;
    const onMetrics = callbacks.onMetrics as ReturnType<typeof mock>;

    makeProcess({
      heartbeatIntervalMs: 20,
      heartbeatTimeoutMs: 1000,
      rssSoftLimitBytes: 512 * MB,
      rssBreachSamples: 2,
    });

    // Metrics are still collected and forwarded on every heartbeat.
    await waitFor(() => onMetrics.mock.calls.length > 0, { timeoutMs: 2000 });
    expect(onBreached).not.toHaveBeenCalled();
  });

  test('samples metrics when the monitor is enabled even if onMetrics is undefined', async () => {
    mockRssBytes = 600 * MB;
    const cbsNoMetrics = { ...callbacks, onMetrics: undefined } as PluginProcessCallbacks;
    callbacks = cbsNoMetrics;
    const onBreached = cbsNoMetrics.onRssSoftLimitBreached as ReturnType<typeof mock>;

    makeProcess({
      heartbeatIntervalMs: 20,
      heartbeatTimeoutMs: 1000,
      rssSoftLimitBytes: 512 * MB,
      rssBreachSamples: 1,
    });

    // The heartbeat enters the metrics branch because the RSS monitor is
    // enabled, even though there is no onMetrics callback.
    await waitFor(() => onBreached.mock.calls.length > 0, { timeoutMs: 2000 });
    expect(onBreached.mock.calls.length).toBe(1);
  });
});
