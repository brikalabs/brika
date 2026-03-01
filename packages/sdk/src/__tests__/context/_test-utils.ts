/**
 * Shared test utilities for context module tests.
 *
 * Provides a mock IPC client, ContextCore factory, and helper functions
 * to avoid duplicating mock infrastructure across every test file.
 */

import { mock } from 'bun:test';
import type { ContextCore, Manifest } from '../../context/register';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Handler = (...args: unknown[]) => unknown;

// ─── Noop Mock ───────────────────────────────────────────────────────────────

/** Create a fresh mock function with a noop body (biome-safe). */
export const noopMock = (): ReturnType<typeof mock<(...args: unknown[]) => unknown>> =>
  mock(() => {
    /* noop */
  });

// ─── Test Harness ────────────────────────────────────────────────────────────

export interface TestHarness {
  /** The ContextCore to pass to setup functions. */
  core: ContextCore;
  /** Mock client methods (send, on, implement, onStop, start). */
  client: {
    send: ReturnType<typeof mock>;
    on: ReturnType<typeof mock>;
    implement: ReturnType<typeof mock>;
    onStop: ReturnType<typeof mock>;
    start: ReturnType<typeof mock>;
  };
  /** Handlers registered via client.on(), keyed by message name. */
  onHandlers: Map<string, Handler>;
  /** RPC handlers registered via client.implement(), keyed by RPC name. */
  implHandlers: Map<string, Handler>;
  /** All messages sent via client.send(). */
  sentMessages: Array<{
    name: string;
    payload: unknown;
  }>;
  /** Log messages captured from core.log(). */
  logMessages: Array<{
    level: string;
    message: string;
  }>;
  /** Clear all mocks and captured state — call in beforeEach. */
  reset(): void;
  /** Trigger a handler registered via client.on(). */
  triggerOn(name: string, payload: unknown): unknown;
  /** Call an RPC handler registered via client.implement(). */
  callImpl(name: string, input: unknown): unknown;
}

/**
 * Create a complete test harness for a context module.
 *
 * @example
 * ```ts
 * const h = createTestHarness({ sparks: [{ id: 'test-spark', name: 'Test' }] });
 * beforeEach(() => h.reset());
 * ```
 */
export function createTestHarness(manifest?: Partial<Manifest>): TestHarness {
  const onHandlers = new Map<string, Handler>();
  const implHandlers = new Map<string, Handler>();
  const sentMessages: Array<{
    name: string;
    payload: unknown;
  }> = [];
  const logMessages: Array<{
    level: string;
    message: string;
  }> = [];

  const client = {
    send: mock(
      (
        def: {
          name: string;
        },
        payload: unknown
      ) => {
        sentMessages.push({
          name: def.name,
          payload,
        });
      }
    ),
    on: mock(
      (
        def: {
          name: string;
        },
        handler: Handler
      ) => {
        onHandlers.set(def.name, handler);
        return () => onHandlers.delete(def.name);
      }
    ),
    implement: mock(
      (
        def: {
          name: string;
        },
        handler: Handler
      ) => {
        implHandlers.set(def.name, handler);
      }
    ),
    onStop: noopMock(),
    start: noopMock(),
  };

  const core: ContextCore = {
    client: client as unknown as ContextCore['client'],
    manifest: {
      name: 'test-plugin',
      version: '1.0.0',
      ...manifest,
    },
    log: mock((level: string, message: string) => {
      logMessages.push({
        level,
        message,
      });
    }) as unknown as ContextCore['log'],
  };

  function reset() {
    client.send.mockClear();
    client.on.mockClear();
    client.implement.mockClear();
    client.onStop.mockClear();
    client.start.mockClear();
    (core.log as ReturnType<typeof mock>).mockClear();
    onHandlers.clear();
    implHandlers.clear();
    sentMessages.length = 0;
    logMessages.length = 0;
  }

  function triggerOn(name: string, payload: unknown) {
    const handler = onHandlers.get(name);
    if (!handler) {
      throw new Error(`No handler registered for "${name}"`);
    }
    return handler(payload);
  }

  function callImpl(name: string, input: unknown) {
    const handler = implHandlers.get(name);
    if (!handler) {
      throw new Error(`No implementation registered for "${name}"`);
    }
    return handler(input);
  }

  return {
    core,
    client,
    onHandlers,
    implHandlers,
    sentMessages,
    logMessages,
    reset,
    triggerOn,
    callImpl,
  };
}
