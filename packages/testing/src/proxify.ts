/**
 * Creates a proxy that delegates to a lazily-resolved instance
 *
 * Useful for creating hook-style test helpers where the instance
 * is created in beforeEach but accessed at describe level.
 *
 * @example
 * ```ts
 * function useMyService(): MyService {
 *   let current: MyService;
 *
 *   beforeEach(() => {
 *     current = new MyService();
 *   });
 *
 *   return proxify(() => current);
 * }
 *
 * describe('test', () => {
 *   const service = useMyService();
 *
 *   test('works', () => {
 *     service.doSomething(); // Delegates to current instance
 *   });
 * });
 * ```
 */
export function proxify<T extends object>(getInstance: () => T): T {
  return new Proxy({} as T, {
    get(_, prop: string | symbol) {
      const instance = getInstance();
      const value = (instance as Record<string | symbol, unknown>)[prop];
      return typeof value === 'function' ? value.bind(instance) : value;
    },
    set(_, prop: string | symbol, value: unknown) {
      const instance = getInstance();
      (instance as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },
    has(_, prop: string | symbol) {
      const instance = getInstance();
      return prop in instance;
    },
    ownKeys() {
      const instance = getInstance();
      return Reflect.ownKeys(instance);
    },
    getOwnPropertyDescriptor(_, prop: string | symbol) {
      const instance = getInstance();
      return Object.getOwnPropertyDescriptor(instance, prop);
    },
  });
}
