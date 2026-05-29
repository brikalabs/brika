/**
 * In-process unit tests for the `globalThis.__brika_grants` /
 * `globalThis.__brika_ipc` injection slots. The integration test in
 * `ctx-install.integration.test.ts` covers the irreversible-lock path
 * (which requires a fresh subprocess); here we exercise the read-side
 * helpers and the lazy `ctx` proxy without touching `installVector` so
 * the locked property never leaks into other tests.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { GrantVector } from '@brika/grants';
import { PRELUDE_BRAND } from './bridge';
import { ctx, GRANTS_BRAND, installVector, readInjectedVector } from './ctx';

interface BrandedVector extends GrantVector {
  readonly [GRANTS_BRAND]: true;
}

interface MaybeGrantsGlobal {
  __brika_grants?: unknown;
  __brika_ipc?: unknown;
}

function brandVector(vector: GrantVector): BrandedVector {
  return Object.freeze({ ...vector, [GRANTS_BRAND]: true as const });
}

function setGlobalVector(vector: BrandedVector | undefined): void {
  const g = globalThis as unknown as MaybeGrantsGlobal;
  if (vector === undefined) {
    delete g.__brika_grants;
  } else {
    // Direct assignment (writable, configurable) so the test can swap /
    // remove it freely. `installVector` is the locked-down equivalent we
    // never call in-process.
    Object.defineProperty(g, '__brika_grants', {
      value: vector,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

function setBridge(
  channelStub: { call: (def: unknown, payload: unknown) => Promise<unknown> } | undefined
): void {
  const g = globalThis as unknown as MaybeGrantsGlobal;
  if (channelStub === undefined) {
    delete g.__brika_ipc;
    return;
  }
  Object.defineProperty(g, '__brika_ipc', {
    value: { [PRELUDE_BRAND]: true, channel: channelStub },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

describe('readInjectedVector (in-process)', () => {
  afterEach(() => {
    setGlobalVector(undefined);
    setBridge(undefined);
  });

  test('throws a clear error when the vector is missing', () => {
    setGlobalVector(undefined);
    expect(() => readInjectedVector()).toThrow(/Brika grant vector is not installed/);
  });

  test('throws when the slot holds an unbranded object', () => {
    const g = globalThis as unknown as MaybeGrantsGlobal;
    Object.defineProperty(g, '__brika_grants', {
      value: { grants: [{ id: 'forged', ctxPath: 'forged' }] },
      writable: true,
      configurable: true,
      enumerable: false,
    });
    expect(() => readInjectedVector()).toThrow(/not installed/);
  });

  test('returns the branded vector intact', () => {
    const vector = brandVector({
      grants: [{ id: 'dev.brika.x.y', ctxPath: 'x.y' }],
    });
    setGlobalVector(vector);
    const read = readInjectedVector();
    expect(read.grants).toEqual([{ id: 'dev.brika.x.y', ctxPath: 'x.y' }]);
  });
});

describe('ctx (lazy proxy)', () => {
  afterEach(() => {
    setGlobalVector(undefined);
    setBridge(undefined);
  });

  test('throws when the prelude bridge is not installed', () => {
    setBridge(undefined);
    setGlobalVector(
      brandVector({
        grants: [{ id: 'dev.brika.x.y', ctxPath: 'x.y' }],
      })
    );
    // Property access triggers buildCtxFromInjection.
    expect(() => {
      const _probe = (ctx as unknown as Record<string, unknown>).x;
      // Reference to suppress unused-var warnings; never reached.
      return _probe;
    }).toThrow(/Brika prelude has not been loaded/);
  });

  test('throws when the bridge exists but the grants slot is empty', () => {
    setBridge({ call: () => Promise.resolve({ result: undefined }) });
    setGlobalVector(undefined);
    expect(() => {
      const _probe = (ctx as unknown as Record<string, unknown>).x;
      return _probe;
    }).toThrow(/Brika grant vector is not installed/);
  });

  test('successful injection routes property reads through the cached Ctx Proxy', async () => {
    const calls: Array<{ name: string; payload: unknown }> = [];
    setBridge({
      call: (def, payload) => {
        const defName = (def as { name: string }).name;
        calls.push({ name: defName, payload });
        return Promise.resolve({ result: { value: 'ok' } });
      },
    });
    setGlobalVector(
      brandVector({
        grants: [{ id: 'dev.brika.injection.test', ctxPath: 'injection.test' }],
      })
    );
    const probe = ctx as unknown as {
      injection: { test: (args: unknown) => Promise<{ value: string }> };
    };
    const result = await probe.injection.test({ a: 1 });
    expect(result).toEqual({ value: 'ok' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload).toEqual({
      id: 'dev.brika.injection.test',
      args: { a: 1 },
    });
  });
});

/**
 * Final block — exercises `installVector` IN-PROCESS. Because `installVector`
 * uses `Object.defineProperty(writable:false, configurable:false)` the slot is
 * locked once we call it; nothing in earlier blocks runs after this. We DO
 * NOT clean up — by design the lock is irreversible. This block must stay at
 * the end of the file so earlier tests (which mutate
 * `globalThis.__brika_grants` directly) can still cleanup via `afterEach`.
 */
describe('installVector (in-process, terminal — locks the slot)', () => {
  test('rejects non-vector inputs with a clear TypeError', () => {
    // We deliberately pass invalid shapes to exercise the runtime guard —
    // the static signature wants a GrantVector, but the test is here to
    // prove the runtime check fires before the type assumption matters.
    // @ts-expect-error — null is not a valid GrantVector
    expect(() => installVector(null)).toThrow(/installVector: expected/);
    // @ts-expect-error — `grants: 'no'` violates GrantVector
    expect(() => installVector({ grants: 'no' })).toThrow(/installVector: expected/);
  });

  test('a valid vector becomes branded + readable; a second install throws', () => {
    // Clear any previous direct-assignment leftover before locking.
    const g = globalThis as unknown as MaybeGrantsGlobal;
    if (g.__brika_grants !== undefined) {
      delete g.__brika_grants;
    }
    installVector({ grants: [{ id: 'dev.brika.locked.test', ctxPath: 'locked.test' }] });
    const v = readInjectedVector();
    expect(v.grants).toEqual([{ id: 'dev.brika.locked.test', ctxPath: 'locked.test' }]);
    expect((v as unknown as Record<symbol, unknown>)[GRANTS_BRAND]).toBe(true);
    // Slot is now non-configurable; a second install raises TypeError.
    expect(() => installVector({ grants: [] })).toThrow(TypeError);
  });
});
