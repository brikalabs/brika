/**
 * Tests for the http-request block
 *
 * Uses mock.module to intercept @brika/sdk so the block handler can be
 * invoked directly without a running plugin runtime.
 *
 * IMPORTANT: mock.module() must stay in this file — Bun bleeds module mocks
 * across worker boundaries, so keep this file isolated.
 */

import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { z } from 'zod';

// SDK's z extends standard Zod with custom types (generic, passthrough, etc.)
// Stub all custom additions so the block's spec can be parsed without a runtime.
const sdkZ = Object.assign({}, z, {
  generic: () => z.unknown(),
  passthrough: () => z.unknown(),
  resolved: () => z.unknown(),
  expression: () => z.string(),
  color: () => z.string(),
  duration: () => z.number(),
  sparkType: () => z.string(),
  code: () => z.string(),
  secret: () => z.string(),
  filePath: () => z.string(),
  url: () => z.string(),
  jsonSchema: () => z.unknown(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Capture variables filled by mock.module
// ─────────────────────────────────────────────────────────────────────────────

type SetupFn = (ctx: {
  inputs: { trigger: { on: (cb: () => Promise<void>) => void } };
  outputs: {
    response: { emit: (data: unknown) => void };
    error: { emit: (data: unknown) => void };
  };
  config: Record<string, unknown>;
}) => void;

let capturedSetup: SetupFn | null = null;
let capturedConfigSchema: z.ZodObject<z.ZodRawShape> | null = null;

mock.module('@brika/sdk', () => ({
  defineReactiveBlock: (
    spec: { id: string; config: z.ZodObject<z.ZodRawShape> },
    setup: SetupFn
  ) => {
    if (spec.id === 'http-request') {
      capturedSetup = setup;
      capturedConfigSchema = spec.config;
    }
    return { id: spec.id, inputs: [], outputs: [], schema: {} };
  },
  input: (schema: unknown) => ({ schema, meta: { name: '' } }),
  output: (schema: unknown, meta: unknown) => ({ schema, meta }),
  log: { debug: mock(), error: mock(), warn: mock(), info: mock() },
  z: sdkZ,
  combine: mock(),
  map: mock(),
  interval: mock(),
  subscribeSpark: mock(),
  delay: mock(),
}));

// Import after mock is set up — this registers capturedSetup
await import('../main');

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function invokeBlock(configInput: Record<string, unknown>) {
  if (!capturedSetup || !capturedConfigSchema) {
    throw new Error('Block was not registered — mock.module may not have run');
  }

  const responseEmit = mock();
  const errorEmit = mock();
  const handlerRef: { current: (() => Promise<void>) | null } = { current: null };

  const ctx = {
    inputs: {
      trigger: {
        on(cb: () => Promise<void>) {
          handlerRef.current = cb;
        },
      },
    },
    outputs: {
      response: { emit: responseEmit },
      error: { emit: errorEmit },
    },
    config: capturedConfigSchema.parse(configInput),
  };

  capturedSetup(ctx);

  const triggerHandler = handlerRef.current;
  if (!triggerHandler) {
    throw new Error('trigger.on was not called during setup');
  }

  return { triggerHandler, responseEmit, errorEmit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

// Bun's fetch type requires a `preconnect` property on the function itself.
// Test mocks don't need it, so we wrap the implementation and suppress the
// single structural-compatibility error here instead of leaking `as` casts.
function mockFetchImpl(
  impl: (url: URL | RequestInfo, opts?: RequestInit) => Promise<Response>
): typeof fetch {
  // @ts-expect-error test mocks don't provide fetch.preconnect
  return impl;
}

describe('http-request block', () => {
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  describe('AbortController / timeout', () => {
    test('passes an AbortSignal to fetch', async () => {
      let capturedSignal: AbortSignal | undefined;

      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(mockFetchImpl(async (_url, opts) => {
        capturedSignal = opts?.signal as AbortSignal;
        return new Response(JSON.stringify({}), { status: 200 });
      }));

      const { triggerHandler } = invokeBlock({ url: 'https://example.com' });
      await triggerHandler();

      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });

    test('signal is not yet aborted on a fast response', async () => {
      let capturedSignal: AbortSignal | undefined;

      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(mockFetchImpl(async (_url, opts) => {
        capturedSignal = opts?.signal as AbortSignal;
        return new Response('ok', { status: 200 });
      }));

      const { triggerHandler } = invokeBlock({ url: 'https://example.com', timeoutMs: 5000 });
      await triggerHandler();

      expect(capturedSignal?.aborted).toBe(false);
    });

    test('aborts fetch and emits error when timeoutMs elapses', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(mockFetchImpl(async (_url, opts) => {
        const signal = opts?.signal as AbortSignal;
        // Simulate a hanging fetch that respects the abort signal
        await new Promise<void>((_, reject) => {
          if (signal?.aborted) {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
            return;
          }
          signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
        return new Response();
      }));

      const { triggerHandler, errorEmit, responseEmit } = invokeBlock({
        url: 'https://example.com',
        timeoutMs: 10,
      });

      await triggerHandler();

      expect(errorEmit).toHaveBeenCalledTimes(1);
      expect(responseEmit).not.toHaveBeenCalled();
    });
  });

  describe('success path', () => {
    test('emits parsed JSON body on 200 response', async () => {
      const body = { id: 1, name: 'test' };

      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        })
      );

      const { triggerHandler, responseEmit, errorEmit } = invokeBlock({
        url: 'https://example.com/api',
        method: 'GET',
      });

      await triggerHandler();

      expect(responseEmit).toHaveBeenCalledTimes(1);
      expect(responseEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          statusText: 'OK',
          body,
        })
      );
      expect(errorEmit).not.toHaveBeenCalled();
    });

    test('emits raw text body when response is not JSON', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('plain text response', { status: 200 })
      );

      const { triggerHandler, responseEmit } = invokeBlock({ url: 'https://example.com' });
      await triggerHandler();

      expect(responseEmit).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'plain text response' })
      );
    });
  });

  describe('error path', () => {
    test('emits error when fetch throws a network error', async () => {
      fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'));

      const { triggerHandler, errorEmit, responseEmit } = invokeBlock({
        url: 'https://example.com',
      });

      await triggerHandler();

      expect(errorEmit).toHaveBeenCalledTimes(1);
      expect(errorEmit).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Network failure') })
      );
      expect(responseEmit).not.toHaveBeenCalled();
    });
  });

  describe('config defaults', () => {
    test('uses GET method by default', async () => {
      let capturedMethod: string | undefined;

      fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(mockFetchImpl(async (_url, opts) => {
        capturedMethod = opts?.method as string;
        return new Response('ok', { status: 200 });
      }));

      const { triggerHandler } = invokeBlock({ url: 'https://example.com' });
      await triggerHandler();

      expect(capturedMethod).toBe('GET');
    });

    test('default timeoutMs is 30000', () => {
      if (!capturedConfigSchema) throw new Error('schema not captured');
      const parsed = capturedConfigSchema.parse({ url: 'https://example.com' });
      expect(parsed.timeoutMs).toBe(30000);
    });
  });
});
