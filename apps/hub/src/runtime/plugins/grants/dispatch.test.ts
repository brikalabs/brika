/**
 * Unit tests for `dispatchGrantRequest`. The function is pure (all
 * dependencies passed in), so we can exercise the vector-lookup branch,
 * the watchdog timeout, and the lifetime-abort path without spinning
 * up an IPC channel or a real plugin process.
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import { defineGrant, GrantRegistry, type GrantVector } from '@brika/grants';
import { z } from 'zod';
import {
  dispatchGrantRequest,
  GRANT_REQUEST_JITTER_MAX_MS,
  GRANT_REQUEST_TIMEOUT_MS,
  jitterDelay,
} from './dispatch';

const echoSpec = defineGrant(
  {
    id: 'dev.brika.test.echo',
    ctxPath: 'test.echo',
    args: z.object({ value: z.string() }),
    result: z.object({ echo: z.string() }),
  },
  (_, args) => ({ echo: args.value })
);

const slowSpec = defineGrant(
  {
    id: 'dev.brika.test.slow',
    ctxPath: 'test.slow',
    args: z.object({}),
    result: z.object({}),
  },
  async (ctx) => {
    if (ctx.signal.aborted) {
      throw ctx.signal.reason ?? new Error('aborted');
    }
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 5_000);
      ctx.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(ctx.signal.reason ?? new Error('aborted'));
        },
        { once: true }
      );
    });
    return {};
  }
);

/** Deliberately ignores `ctx.signal`: models a handler that won't honour the abort. */
const uncooperativeSpec = defineGrant(
  {
    id: 'dev.brika.test.uncooperative',
    ctxPath: 'test.uncooperative',
    args: z.object({}),
    result: z.object({}),
  },
  async () => {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 2_000);
      // Don't keep the test process alive for the full hang once the watchdog wins.
      t.unref();
    });
    return {};
  }
);

function makeDeps(
  opts: { vector: GrantVector; registry?: GrantRegistry } & Partial<{
    lifetimeSignal: AbortSignal;
    pluginUid: string;
    pluginRoot: string;
  }>
) {
  const reg = opts.registry ?? new GrantRegistry();
  if (!opts.registry) {
    reg.register(echoSpec);
    reg.register(slowSpec);
    reg.register(uncooperativeSpec);
  }
  return {
    registry: reg,
    buildVector: () => opts.vector,
    pluginUid: opts.pluginUid ?? 'plug-test',
    pluginRoot: opts.pluginRoot ?? '/nonexistent/brika-dispatch-test',
    log: () => {},
    lifetimeSignal: opts.lifetimeSignal ?? new AbortController().signal,
  };
}

describe('dispatchGrantRequest', () => {
  test('happy path: vector hit → registry dispatch → result', async () => {
    const out = await dispatchGrantRequest(
      makeDeps({
        vector: {
          grants: [{ id: 'dev.brika.test.echo', ctxPath: 'test.echo' }],
        },
      }),
      { id: 'dev.brika.test.echo', args: { value: 'hello' } },
      { skipJitter: true }
    );
    expect(out).toEqual({ result: { echo: 'hello' } });
  });

  test('vector miss → PERMISSION_DENIED thrown before dispatch', async () => {
    let thrown: BrikaError | undefined;
    try {
      await dispatchGrantRequest(
        makeDeps({ vector: { grants: [] } }),
        { id: 'dev.brika.test.echo', args: { value: 'x' } },
        { skipJitter: true }
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('PERMISSION_DENIED');
    expect(thrown?.data).toMatchObject({ permission: 'dev.brika.test.echo' });
  });

  test('jitter delay falls within [0, GRANT_REQUEST_JITTER_MAX_MS + slack]', async () => {
    // Wall-clock guarantee — bun:test setTimeout has ms-resolution drift,
    // so allow a generous upper bound. We mainly want to assert the delay
    // does NOT exceed the published cap by orders of magnitude.
    const start = Date.now();
    await jitterDelay();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(0);
    // 50ms upper bound accommodates loaded CI runners; the real ceiling
    // inside the jitter sampler is GRANT_REQUEST_JITTER_MAX_MS = 5.
    expect(elapsed).toBeLessThan(50);
  });

  test('exposes the published constants', () => {
    expect(GRANT_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    // `GRANT_REQUEST_JITTER_MAX_MS` is allowed to be 0 — the dispatcher
    // still yields the event loop via `Bun.sleep(0)`, just without
    // adding measurable delay. Bumping this above 0 re-enables the
    // timing-oracle defence at a per-dispatch cost.
    expect(GRANT_REQUEST_JITTER_MAX_MS).toBeGreaterThanOrEqual(0);
    expect(GRANT_REQUEST_JITTER_MAX_MS).toBeLessThanOrEqual(20); // sanity cap
  });

  test('watchdog timeout fires when handler ignores deadline', async () => {
    let thrown: unknown;
    try {
      await dispatchGrantRequest(
        makeDeps({
          vector: {
            grants: [{ id: 'dev.brika.test.slow', ctxPath: 'test.slow' }],
          },
        }),
        { id: 'dev.brika.test.slow', args: {} },
        { skipJitter: true, timeoutMs: 50 }
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    // Either the platform's TimeoutError or our cooperative reject.
    expect(thrown).toBeInstanceOf(Error);
    if (thrown instanceof Error) {
      expect(thrown.message.toLowerCase()).toMatch(/abort|timed out|timeout|signal/);
    }
  });

  test('watchdog force-rejects an uncooperative handler that ignores the abort signal', async () => {
    // The handler never honours ctx.signal; without racing the deadline this
    // would resolve after 2s instead of rejecting promptly at the timeout.
    const start = Date.now();
    let thrown: unknown;
    try {
      await dispatchGrantRequest(
        makeDeps({
          vector: {
            grants: [{ id: 'dev.brika.test.uncooperative', ctxPath: 'test.uncooperative' }],
          },
        }),
        { id: 'dev.brika.test.uncooperative', args: {} },
        { skipJitter: true, timeoutMs: 50 }
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BrikaError);
    if (thrown instanceof BrikaError) {
      expect(thrown.code).toBe('TIMEOUT');
    }
    // Rejected at the deadline, not after the handler's 2s hang.
    expect(Date.now() - start).toBeLessThan(1_000);
  });

  test('lifetime abort short-circuits dispatch', async () => {
    const controller = new AbortController();
    controller.abort(new Error('plugin stop'));
    let thrown: unknown;
    try {
      await dispatchGrantRequest(
        makeDeps({
          vector: {
            grants: [{ id: 'dev.brika.test.slow', ctxPath: 'test.slow' }],
          },
          lifetimeSignal: controller.signal,
        }),
        { id: 'dev.brika.test.slow', args: {} },
        { skipJitter: true, timeoutMs: 5_000 }
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
  });

  test('jitter applies by default (no skipJitter flag) without affecting correctness', async () => {
    // Smoke test: same call shape as the happy path, but jitter enabled.
    // Asserts the function works without skipJitter and stays well under
    // 50ms (the jitter cap is 5ms).
    const start = Date.now();
    const out = await dispatchGrantRequest(
      makeDeps({
        vector: {
          grants: [{ id: 'dev.brika.test.echo', ctxPath: 'test.echo' }],
        },
      }),
      { id: 'dev.brika.test.echo', args: { value: 'jittered' } }
    );
    const elapsed = Date.now() - start;
    expect(out).toEqual({ result: { echo: 'jittered' } });
    expect(elapsed).toBeLessThan(100);
  });
});
