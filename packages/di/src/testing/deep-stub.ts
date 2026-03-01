/**
 * Deep stub factory - creates proxy-based stubs that auto-mock all properties and methods.
 *
 * Properties accessed on the stub are auto-generated as nested stubs unless overridden.
 * Certain JS protocol properties (Promise, JSON, iteration) are excluded from auto-stubbing
 * to prevent breaking `await`, `JSON.stringify`, and spread/iteration semantics.
 */

/** Properties that must NOT be auto-stubbed — they break core JS protocols. */
const NO_AUTO_STUB: ReadonlySet<string | symbol> = new Set([
  // Promise protocol — stubbing makes proxies look thenable, breaks `await`
  'then',
  'catch',
  'finally',
  // Iteration / spread — stubbing breaks `for..of`, `Array.from`, `[...obj]`
  Symbol.iterator,
  Symbol.asyncIterator,
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isThenable(value: unknown): boolean {
  return (
    value instanceof Promise ||
    (!!value &&
      typeof (
        value as {
          then?: unknown;
        }
      ).then === 'function')
  );
}

/** Creates a deep stub that returns no-op functions for any method and nested stubs for properties. */
export function createDeepStub<T>(overrides: Partial<T> = {}): T {
  const cache = new Map<string | symbol, unknown>();

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      // Skip JS protocol properties that break core semantics when stubbed
      if (NO_AUTO_STUB.has(prop) && !(prop in overrides)) {
        return undefined;
      }

      // Support JSON.stringify — return a toJSON that snapshots override values
      if (prop === 'toJSON' && !(prop in overrides)) {
        return () => ({
          ...(overrides as object),
        });
      }

      // Return override if provided
      if (prop in overrides) {
        const override = (overrides as Record<string | symbol, unknown>)[prop];

        if (typeof override === 'function') {
          return function (this: unknown, ...args: unknown[]) {
            const result = (override as (...args: unknown[]) => unknown).apply(this, args);
            // Re-wrap plain objects so un-overridden properties auto-stub,
            // but pass through promises and primitives as-is.
            if (isThenable(result)) {
              return result;
            }
            if (isPlainObject(result)) {
              return createDeepStub(result);
            }
            return result;
          };
        }
        return override;
      }

      // Return cached stub
      if (cache.has(prop)) {
        return cache.get(prop);
      }

      // Create nested stub function
      const nestedStub = new Proxy(() => createDeepStub(), handler);
      cache.set(prop, nestedStub);
      return nestedStub;
    },

    apply() {
      return createDeepStub();
    },
  };

  return new Proxy({}, handler) as T;
}
