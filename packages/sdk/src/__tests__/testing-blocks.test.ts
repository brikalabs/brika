/**
 * Tests for `createMockBlockContext` — the unit-test harness exported from
 * `@brika/sdk/testing`. Covers push→emit, lifecycle cleanup, secrets/prefs
 * read-through, type-safety of `emitted()`, and `clear()`.
 *
 * We mock the SDK's `context` module to a fallback registerBlock so that
 * `defineReactiveBlock(...)` calls do not throw at module load. The harness
 * itself installs a Context stub via the `Symbol.for('brika.testing.context')`
 * slot on globalThis that `getContext()` reads — that slot is checked
 * directly inside the (unmocked) original `getContext`, but since other
 * tests mock it process-wide, we route every read through our fallback.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { z } from 'zod';

const TEST_CTX = Symbol.for('brika.testing.context');
const fallbackContext = {
  registerBlock: () => ({ id: 'mock' }),
};

// Mock only `getContext` — the harness reads its stub from a globalThis
// symbol that this mock also consults, so the install/restore semantics
// work end-to-end even though we never call the real getContext. We
// deliberately do NOT mock '../api/logging' here, because other tests in
// the suite (e.g. api-logging.test.ts) rely on the real module shape;
// bun:test mock.module is process-wide.
mock.module('../context', () => ({
  getContext: () => {
    const slot = (globalThis as { [TEST_CTX]?: unknown })[TEST_CTX];
    return slot ?? fallbackContext;
  },
}));

// Import the SUTs after mocks are installed.
const { defineReactiveBlock } = await import('../blocks/reactive-define');
const { input, output } = await import('../blocks/reactive');
const { createMockBlockContext } = await import('../testing/blocks');
const { getSecret } = await import('../api/secrets');
const { getPreferences } = await import('../api/preferences');

function getActiveContext(): unknown {
  return (globalThis as { [TEST_CTX]?: unknown })[TEST_CTX];
}

beforeEach(() => {
  delete (globalThis as { [TEST_CTX]?: unknown })[TEST_CTX];
});

afterEach(() => {
  delete (globalThis as { [TEST_CTX]?: unknown })[TEST_CTX];
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** A trivial identity block: pushes from `in` go straight to `out`. */
const identityBlock = defineReactiveBlock(
  {
    id: 'identity',
    inputs: { in: input(z.number(), { name: 'In' }) },
    outputs: { out: output(z.number(), { name: 'Out' }) },
    config: z.object({}),
  },
  ({ inputs, outputs }) => {
    inputs.in.on((v) => outputs.out.emit(v));
  }
);

/**
 * A stateful block that buffers inputs and emits the sum after every N
 * pushes. Exercises that the harness's flush waits for microtask-deferred
 * emits and that emitted() captures multiple values across windows.
 */
const batchSumBlock = defineReactiveBlock(
  {
    id: 'batch-sum',
    inputs: { value: input(z.number(), { name: 'Value' }) },
    outputs: { sum: output(z.number(), { name: 'Sum' }) },
    config: z.object({ window: z.number().default(3) }),
  },
  ({ inputs, outputs, config }) => {
    let acc: number[] = [];
    inputs.value.on((v) => {
      acc.push(v);
      if (acc.length >= config.window) {
        outputs.sum.emit(acc.reduce((a, b) => a + b, 0));
        acc = [];
      }
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Happy paths
// ─────────────────────────────────────────────────────────────────────────────

describe('createMockBlockContext — basic push/emit', () => {
  test('forwards push to emitted on a simple identity block', async () => {
    const h = createMockBlockContext(identityBlock);
    await h.start();
    for (const v of [1, 2, 3]) {
      h.push('in', v);
    }
    await h.flush();

    expect(h.emitted('out')).toEqual([1, 2, 3]);
    await h.stop();
  });

  test('emitted() returns an isolated copy (mutation does not affect buffer)', async () => {
    const h = createMockBlockContext(identityBlock);
    await h.start();
    h.push('in', 10);
    await h.flush();
    const snapshot = h.emitted('out');
    snapshot.push(999);
    expect(h.emitted('out')).toEqual([10]);
    await h.stop();
  });

  test('emitted() values keep their TS-typed shape', async () => {
    const objectBlock = defineReactiveBlock(
      {
        id: 'object-emitter',
        inputs: { in: input(z.string(), { name: 'In' }) },
        outputs: {
          point: output(z.object({ x: z.number(), y: z.number() }), { name: 'Point' }),
        },
        config: z.object({}),
      },
      ({ inputs, outputs }) => {
        inputs.in.on(() => outputs.point.emit({ x: 1, y: 2 }));
      }
    );

    const h = createMockBlockContext(objectBlock);
    await h.start();
    h.push('in', 'go');
    await h.flush();

    const points = h.emitted('point');
    // Compile-time check: `.x` and `.y` must be `number`. Runtime mirrors that.
    const first = points[0];
    expect(first).toBeDefined();
    if (first) {
      expect(first.x).toBe(1);
      expect(first.y).toBe(2);
    }
    await h.stop();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stateful block
// ─────────────────────────────────────────────────────────────────────────────

describe('createMockBlockContext — stateful block', () => {
  test('only emits once the configured window is reached', async () => {
    const h = createMockBlockContext(batchSumBlock, { config: { window: 3 } });
    await h.start();

    for (const v of [1, 2]) {
      h.push('value', v);
    }
    await h.flush();
    expect(h.emitted('sum')).toEqual([]);

    h.push('value', 3);
    await h.flush();
    expect(h.emitted('sum')).toEqual([6]);

    for (const v of [10, 20, 30]) {
      h.push('value', v);
    }
    await h.flush();
    expect(h.emitted('sum')).toEqual([6, 60]);

    await h.stop();
  });

  test('uses spec defaults for config when caller omits it', async () => {
    // Window defaults to 3; default flows through Zod parsing in the block.
    const h = createMockBlockContext(batchSumBlock);
    await h.start();
    for (const v of [1, 1, 1]) {
      h.push('value', v);
    }
    await h.flush();
    expect(h.emitted('sum')).toEqual([3]);
    await h.stop();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe('createMockBlockContext — lifecycle', () => {
  test('start() is idempotent — second call is a no-op', async () => {
    const h = createMockBlockContext(identityBlock);
    await h.start();
    await h.start();
    h.push('in', 7);
    await h.flush();
    expect(h.emitted('out')).toEqual([7]);
    await h.stop();
  });

  test('push() before start() throws a useful error', () => {
    const h = createMockBlockContext(identityBlock);
    expect(() => h.push('in', 1)).toThrow(/before start\(\)/);
  });

  test('stop() runs the cleanup registry so subsequent push goes nowhere', async () => {
    const seen: number[] = [];
    const block = defineReactiveBlock(
      {
        id: 'lifecycle-block',
        inputs: { in: input(z.number(), { name: 'In' }) },
        outputs: {},
        config: z.object({}),
      },
      ({ inputs }) => {
        inputs.in.on((v) => seen.push(v));
      }
    );

    const h = createMockBlockContext(block);
    await h.start();
    h.push('in', 1);
    await h.flush();
    expect(seen).toEqual([1]);

    await h.stop();
    // After stop() the harness's instance is cleared; pushing again throws.
    expect(() => h.push('in', 2)).toThrow(/before start\(\)/);
    expect(seen).toEqual([1]);
  });

  test('stop() restores the previous singleton context', async () => {
    const h = createMockBlockContext(identityBlock);
    expect(getActiveContext()).toBeUndefined();
    await h.start();
    expect(getActiveContext()).toBeDefined();
    await h.stop();
    expect(getActiveContext()).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Clear
// ─────────────────────────────────────────────────────────────────────────────

describe('createMockBlockContext — clear()', () => {
  test('clear(name) empties only the named buffer; clear() empties every buffer', async () => {
    const dualBlock = defineReactiveBlock(
      {
        id: 'dual',
        inputs: { in: input(z.number(), { name: 'In' }) },
        outputs: {
          a: output(z.number(), { name: 'A' }),
          b: output(z.number(), { name: 'B' }),
        },
        config: z.object({}),
      },
      ({ inputs, outputs }) => {
        inputs.in.on((v) => {
          outputs.a.emit(v);
          outputs.b.emit(v * 2);
        });
      }
    );

    const h = createMockBlockContext(dualBlock);
    await h.start();
    h.push('in', 4);
    await h.flush();
    expect(h.emitted('a')).toEqual([4]);
    expect(h.emitted('b')).toEqual([8]);

    h.clear('a');
    expect(h.emitted('a')).toEqual([]);
    expect(h.emitted('b')).toEqual([8]);

    h.clear();
    expect(h.emitted('a')).toEqual([]);
    expect(h.emitted('b')).toEqual([]);

    await h.stop();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Secrets & preferences read-through
// ─────────────────────────────────────────────────────────────────────────────

describe('createMockBlockContext — secrets/preferences read-through', () => {
  test('block can read secrets supplied via options.secrets', async () => {
    const seen: Array<string | null> = [];
    const block = defineReactiveBlock(
      {
        id: 'secret-reader',
        inputs: { trigger: input(z.boolean(), { name: 'Trigger' }) },
        outputs: { token: output(z.string(), { name: 'Token' }) },
        config: z.object({}),
      },
      ({ inputs, outputs }) => {
        inputs.trigger.on(async () => {
          // getSecret() calls getContext().getSecret(); the harness installs
          // a stub context for the duration of start()→stop().
          const value = await getSecret('apiKey');
          seen.push(value);
          if (value !== null) {
            outputs.token.emit(value);
          }
        });
      }
    );

    const h = createMockBlockContext(block, {
      secrets: { apiKey: 'secret-123' },
    });
    await h.start();
    h.push('trigger', true);
    // The async handler resolves in a microtask; flush enough to let both
    // the await getSecret and the subsequent emit land.
    await h.flush();
    await h.flush();

    expect(seen).toEqual(['secret-123']);
    expect(h.emitted('token')).toEqual(['secret-123']);
    await h.stop();
  });

  test('unknown secret keys resolve to null (matches real API)', async () => {
    const seen: Array<string | null> = [];
    const block = defineReactiveBlock(
      {
        id: 'secret-missing',
        inputs: { trigger: input(z.boolean(), { name: 'Trigger' }) },
        outputs: {},
        config: z.object({}),
      },
      ({ inputs }) => {
        inputs.trigger.on(async () => {
          seen.push(await getSecret('not-set'));
        });
      }
    );

    const h = createMockBlockContext(block);
    await h.start();
    h.push('trigger', true);
    await h.flush();
    await h.flush();
    expect(seen).toEqual([null]);
    await h.stop();
  });

  test('block can read preferences supplied via options.preferences', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const block = defineReactiveBlock(
      {
        id: 'pref-reader',
        inputs: { trigger: input(z.boolean(), { name: 'Trigger' }) },
        outputs: {},
        config: z.object({}),
      },
      ({ inputs }) => {
        inputs.trigger.on(() => {
          // Sync read — getPreferences() goes straight to the harness stub.
          captured.push(getPreferences());
        });
      }
    );

    const h = createMockBlockContext(block, {
      preferences: { units: 'metric', debug: true },
    });
    await h.start();
    h.push('trigger', true);
    await h.flush();

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ units: 'metric', debug: true });
    await h.stop();
  });
});
