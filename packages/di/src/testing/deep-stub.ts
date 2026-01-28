/**
 * Deep Stub Factory
 *
 * Creates proxy-based stubs that auto-mock all properties and methods.
 */

/**
 * Creates a deep stub that returns no-op functions for any method call
 * and nested stubs for any property access.
 *
 * @example
 * const stub = createDeepStub<Logger>();
 * stub.info('test');           // no-op
 * stub.withSource('hub').info('test'); // also works, returns nested stub
 *
 * @example With overrides
 * const stub = createDeepStub<Logger>({ error: (msg) => console.log(msg) });
 * stub.info('test');           // no-op (auto-stubbed)
 * stub.error('oops');          // logs 'oops' (override used)
 *
 * @example With nested overrides - override returns partial, rest is stubbed
 * const stub = createDeepStub<Logger>({
 *   withSource: () => ({ error: customErrorFn })  // info, warn, etc auto-stubbed
 * });
 */
export function createDeepStub<T>(overrides: Partial<T> = {}): T {
  const cache = new Map<string | symbol, unknown>();

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      // Don't make stubs look like thenables - this breaks await
      // If user needs a Promise, they should override explicitly
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        if (!(prop in overrides)) {
          return undefined;
        }
      }

      // Return override if provided
      if (prop in overrides) {
        const override = (overrides as Record<string | symbol, unknown>)[prop];

        // If override is a function, wrap it to merge its result with a deep stub
        if (typeof override === 'function') {
          // Return a function that preserves the override's this context
          // and wraps its result in a deep stub if it's an object
          return function (this: unknown, ...args: unknown[]) {
            const result = (override as (...args: unknown[]) => unknown).apply(this, args);
            // If result is a promise or thenable, don't wrap it
            if (
              result instanceof Promise ||
              (result && typeof (result as { then?: unknown }).then === 'function')
            ) {
              return result;
            }
            // If result is an object, merge it with a deep stub for missing properties
            if (result && typeof result === 'object' && !Array.isArray(result)) {
              return createDeepStub(result as Record<string, unknown>);
            }
            return result;
          };
        }

        return override;
      }

      // Return cached value if exists
      if (cache.has(prop)) {
        return cache.get(prop);
      }

      // Create a function that returns a nested stub
      // This handles both method calls and property access
      const stubFn = (..._args: unknown[]): unknown => {
        return createDeepStub();
      };

      // Make the function also act as a nested stub for chaining
      const nestedStub = new Proxy(stubFn, handler);
      cache.set(prop, nestedStub);
      return nestedStub;
    },

    apply(_target, _thisArg, _args) {
      // When called as a function, return a nested stub for chaining
      return createDeepStub();
    },
  };

  return new Proxy({}, handler) as T;
}
