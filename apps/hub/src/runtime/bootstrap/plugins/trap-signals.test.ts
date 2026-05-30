/**
 * Tests for the trap-signals bootstrap plugin.
 *
 * The plugin wires OS signal handlers to a bounded graceful shutdown. We
 * exercise it without touching the real process by capturing the handlers
 * registered via `process.on` and stubbing `process.exit`.
 */
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import type { Bootstrap, ShutdownResult } from '@/runtime/bootstrap/bootstrap';
import { trapSignals } from '@/runtime/bootstrap/plugins/trap-signals';
import type { BrikaConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';

useTestBed({
  autoStub: false,
});

type SignalHandler = () => void | Promise<void>;

const configWithGrace = (gracePeriodMs: number): BrikaConfig =>
  ({
    hub: { shutdown: { gracePeriodMs } },
  }) as BrikaConfig;

/**
 * Stand-in Bootstrap whose `shutdown` resolves to a configurable outcome and
 * records how it was invoked, so the plugin's signal-handling can be asserted
 * in isolation.
 */
function fakeBootstrap(result: ShutdownResult) {
  const shutdown = mock((_gracePeriodMs: number) => Promise.resolve(result));
  const bootstrap = { shutdown } as unknown as Bootstrap;
  return { bootstrap, shutdown };
}

describe('trapSignals', () => {
  let handlers: Map<string, SignalHandler>;
  let onSpy: ReturnType<typeof mock>;
  let exitSpy: ReturnType<typeof mock>;
  const originalOn = process.on.bind(process);
  const originalExit = process.exit.bind(process);

  beforeEach(() => {
    stub(Logger);
    handlers = new Map();
    onSpy = mock((signal: string, handler: SignalHandler) => {
      handlers.set(signal, handler);
      return process;
    });
    exitSpy = mock((_code?: number) => undefined as never);
    process.on = onSpy as unknown as typeof process.on;
    process.exit = exitSpy as unknown as typeof process.exit;
  });

  afterEach(() => {
    process.on = originalOn;
    process.exit = originalExit;
  });

  test('registers handlers for the default signals', () => {
    const plugin = trapSignals();
    plugin.onStart?.();

    expect([...handlers.keys()].sort()).toEqual(['SIGHUP', 'SIGINT', 'SIGTERM']);
  });

  test('registers handlers only for the requested signals', () => {
    const plugin = trapSignals(['SIGTERM']);
    plugin.onStart?.();

    expect([...handlers.keys()]).toEqual(['SIGTERM']);
  });

  test('a clean drain shuts down with the configured grace period and exits 0', async () => {
    const { bootstrap, shutdown } = fakeBootstrap('drained');
    const plugin = trapSignals(['SIGTERM']);

    plugin.setup?.(bootstrap);
    plugin.onLoad?.(configWithGrace(7500));
    plugin.onStart?.();

    await handlers.get('SIGTERM')?.();

    expect(shutdown).toHaveBeenCalledWith(7500);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('a timed-out shutdown exits with a non-zero code', async () => {
    const { bootstrap, shutdown } = fakeBootstrap('timeout');
    const plugin = trapSignals(['SIGINT']);

    plugin.setup?.(bootstrap);
    plugin.onLoad?.(configWithGrace(3000));
    plugin.onStart?.();

    await handlers.get('SIGINT')?.();

    expect(shutdown).toHaveBeenCalledWith(3000);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('a second signal mid-shutdown is ignored (no double teardown)', async () => {
    let resolveShutdown: (result: ShutdownResult) => void = () => {};
    const shutdown = mock(
      (_gracePeriodMs: number) =>
        new Promise<ShutdownResult>((resolve) => {
          resolveShutdown = resolve;
        })
    );
    const bootstrap = { shutdown } as unknown as Bootstrap;

    const plugin = trapSignals(['SIGTERM']);
    plugin.setup?.(bootstrap);
    plugin.onLoad?.(configWithGrace(1000));
    plugin.onStart?.();

    const handler = handlers.get('SIGTERM');
    if (!handler) {
      throw new Error('handler not registered');
    }

    // First Ctrl-C kicks off shutdown; the operator hits it again before it
    // finishes — the guard must drop the second one.
    const first = handler();
    const second = handler();

    resolveShutdown('drained');
    await Promise.all([first, second]);

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('exposes a stable plugin name', () => {
    expect(trapSignals().name).toBe('trap-signals');
  });
});
