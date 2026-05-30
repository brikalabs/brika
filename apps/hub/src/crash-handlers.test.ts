import { afterEach, beforeEach, describe, expect, type Mock, mock, spyOn, test } from 'bun:test';
import { provide, useTestBed } from '@brika/di/testing';
import { crashHandlers } from '@/runtime/bootstrap/plugins/crash-handlers';
import { Logger } from '@/runtime/logs/log-router';
import { LogStore } from '@/runtime/logs/log-store';
import { RESTART_CODE } from '@/runtime/restart-code';

useTestBed({
  autoStub: false,
});

type LoggerError = Logger['error'];
type ProcessHandler = (arg: unknown) => void;

// The fake process.exit must return `never`; throwing a sentinel is the
// only way to satisfy that without an `as` cast. Tests catch it so the
// thrown value never escapes a handler invocation.
class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

describe('crash-handlers', () => {
  const mockLogger = {
    error: mock<LoggerError>(() => {}),
  };
  const mockLogStore = {
    close: mock<LogStore['close']>(() => {}),
  };

  // Capture the handlers the plugin registers without letting them attach
  // to the real process (an uncaughtException listener firing process.exit
  // would tear the test runner down).
  const handlers = new Map<string, ProcessHandler>();
  let exitSpy: Mock<typeof process.exit>;

  beforeEach(() => {
    handlers.clear();
    mockLogger.error.mockClear();
    mockLogStore.close.mockClear();

    provide(Logger, mockLogger);
    provide(LogStore, mockLogStore);

    const fakeOn = (event: string, handler: ProcessHandler): NodeJS.Process => {
      if (event === 'uncaughtException' || event === 'unhandledRejection') {
        handlers.set(event, handler);
      }
      return process;
    };
    spyOn(process, 'on').mockImplementation(fakeOn);
    exitSpy = spyOn(process, 'exit').mockImplementation((code) => {
      throw new ExitSignal(typeof code === 'number' ? code : 0);
    });
  });

  afterEach(() => {
    mock.restore();
  });

  function start(): void {
    crashHandlers().onStart?.();
  }

  /** Invoke a captured handler, swallowing the simulated process.exit. */
  function trigger(event: 'uncaughtException' | 'unhandledRejection', arg: unknown): void {
    try {
      handlers.get(event)?.(arg);
    } catch (error) {
      if (!(error instanceof ExitSignal)) {
        throw error;
      }
    }
  }

  test('registers both fatal handlers on start', () => {
    start();
    expect(handlers.has('uncaughtException')).toBe(true);
    expect(handlers.has('unhandledRejection')).toBe(true);
  });

  test('uncaughtException logs the error, flushes logs and exits for restart', () => {
    start();
    const error = new Error('boom');
    trigger('uncaughtException', error);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [message, meta, options] = mockLogger.error.mock.calls[0];
    expect(message).toBe('hub.crash');
    expect(meta).toEqual({ event: 'uncaughtException' });
    expect(options).toEqual({ error });

    expect(mockLogStore.close).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(RESTART_CODE);
  });

  test('unhandledRejection wraps a non-Error reason without losing it', () => {
    start();
    trigger('unhandledRejection', 'nope');

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const logged = mockLogger.error.mock.calls[0][2]?.error;
    expect(logged).toBeInstanceOf(Error);
    expect(logged instanceof Error ? logged.message : '').toBe('nope');
    expect(exitSpy).toHaveBeenCalledWith(RESTART_CODE);
  });

  test('is idempotent: a second crash does not run the exit path again', () => {
    start();
    trigger('uncaughtException', new Error('first'));
    trigger('unhandledRejection', new Error('second'));

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogStore.close).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledTimes(1);
  });
});
