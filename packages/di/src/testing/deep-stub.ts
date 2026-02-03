/**
 * Deep stub factory - creates proxy-based stubs that auto-mock all properties and methods.
 */

const PROMISE_METHODS = ['then', 'catch', 'finally'] as const;

function isThenable(value: unknown): boolean {
  return (
    value instanceof Promise ||
    (!!value && typeof (value as { then?: unknown }).then === 'function')
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Creates a deep stub that returns no-op functions for any method and nested stubs for properties. */
export function createDeepStub<T>(overrides: Partial<T> = {}): T {
  const cache = new Map<string | symbol, unknown>();

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      // Don't make stubs look like thenables - breaks await
      if (
        PROMISE_METHODS.includes(prop as (typeof PROMISE_METHODS)[number]) &&
        !(prop in overrides)
      ) {
        return undefined;
      }

      // Return override if provided
      if (prop in overrides) {
        const override = (overrides as Record<string | symbol, unknown>)[prop];

        if (typeof override === 'function') {
          return function (this: unknown, ...args: unknown[]) {
            const result = (override as (...args: unknown[]) => unknown).apply(this, args);
            if (isThenable(result)) return result;
            if (isPlainObject(result)) return createDeepStub(result);
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
