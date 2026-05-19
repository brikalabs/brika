/**
 * Default test-mode Context stub.
 *
 * Plugins commonly call lifecycle hooks (`onInit`, `onStop`), logging
 * (`log.info`), and `define*` registrations at module-load time. Those calls
 * route through `getContext()` immediately on import, before any test code
 * runs. Without a stub in place the SDK throws
 * "SDK only works in plugin processes spawned by BRIKA hub".
 *
 * Importing `@brika/sdk/testing` (or any of its subpaths) installs this
 * permissive no-op stub as a side effect. `createMockBlockContext` then
 * upgrades the slot with a richer stub while running, and restores the
 * default on `stop()`.
 *
 * The stub returns a no-op function for any property access — so
 * `log.info()`, `onStop(fn)`, `defineSpark({...})`, etc. all succeed silently.
 * If a test needs deterministic behavior from one of these calls, use
 * `createMockBlockContext` (which overrides the slot) or stub `getContext`
 * directly via `mock.module`.
 */

const TEST_CTX = Symbol.for('brika.testing.context');

interface TestCtxGlobal {
  [TEST_CTX]?: unknown;
}

const noop = (): void => {};

type Callable = (...args: unknown[]) => unknown;

function buildPermissiveStub(): unknown {
  // Proxy returns a no-op for every property access; calling the proxy
  // itself returns undefined; nested reads return more proxies. Symbol-keyed
  // reads return undefined so Promise/iterator probes don't accidentally
  // treat the stub as thenable.
  const handler: ProxyHandler<Callable> = {
    get(_target, prop) {
      if (typeof prop === 'symbol') {
        return undefined;
      }
      return new Proxy(noop, handler);
    },
    apply() {
      return undefined;
    },
  };
  return new Proxy(noop, handler);
}

const slot = globalThis as TestCtxGlobal;
if (slot[TEST_CTX] === undefined) {
  slot[TEST_CTX] = buildPermissiveStub();
}
