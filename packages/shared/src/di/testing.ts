/**
 * Modern Testing Utilities for DI
 *
 * Inspired by Angular TestBed, NestJS TestingModule, and Vitest.
 * Provides a fluent, type-safe API for testing with dependency injection.
 *
 * @example
 * ```ts
 * import { TestBed, mock, spy } from "@brika/shared";
 *
 * describe("MyService", () => {
 *   beforeEach(() => {
 *     TestBed.create()
 *       .mock(Logger, {
 *         info: spy(),
 *         error: spy(),
 *       })
 *       .compile();
 *   });
 *
 *   afterEach(() => TestBed.reset());
 *
 *   it("should work", () => {
 *     const service = TestBed.get(MyService);
 *     service.doSomething();
 *
 *     expect(TestBed.get(Logger).info).toHaveBeenCalledWith("event");
 *   });
 * });
 * ```
 */

import { container } from 'tsyringe';

type Constructor<T = unknown> = new (...args: unknown[]) => T;
type AnyFunction = (...args: unknown[]) => unknown;

// ─────────────────────────────────────────────────────────────────────────────
// Spy Function - Vitest/Jest-like API
// ─────────────────────────────────────────────────────────────────────────────

export interface SpyFn<TArgs extends unknown[] = unknown[], TReturn = unknown> {
  /** All recorded calls */
  readonly calls: TArgs[];
  /** Number of times called */
  readonly callCount: number;
  /** Whether the spy was called at least once */
  readonly called: boolean;
  /** Get the last call arguments */
  readonly lastCall: TArgs | undefined;
  /** Get the first call arguments */
  readonly firstCall: TArgs | undefined;

  (...args: TArgs): TReturn;

  /** Reset all call history */
  reset(): this;

  /** Set return value for all calls */
  mockReturnValue(value: TReturn): this;

  /** Set return value once (queued) */
  mockReturnValueOnce(value: TReturn): this;

  /** Set implementation function */
  mockImplementation(fn: (...args: TArgs) => TReturn): this;

  /** Set implementation once (queued) */
  mockImplementationOnce(fn: (...args: TArgs) => TReturn): this;

  /** For async: set resolved value */
  mockResolvedValue(value: Awaited<TReturn>): this;

  /** For async: set resolved value once */
  mockResolvedValueOnce(value: Awaited<TReturn>): this;

  /** For async: set rejected value */
  mockRejectedValue(error: unknown): this;

  /** For async: set rejected value once */
  mockRejectedValueOnce(error: unknown): this;

  /** Assert spy was called with specific arguments */
  calledWith(...args: TArgs): boolean;

  /** Get call at specific index */
  nthCall(n: number): TArgs | undefined;
}

/**
 * Create a spy function with Vitest/Jest-like API
 *
 * @example
 * ```ts
 * const fn = spy<[string], number>();
 * fn.mockReturnValue(42);
 *
 * fn("hello"); // returns 42
 *
 * expect(fn.called).toBe(true);
 * expect(fn.callCount).toBe(1);
 * expect(fn.lastCall).toEqual(["hello"]);
 * ```
 */
export function spy<TArgs extends unknown[] = unknown[], TReturn = void>(
  initialImpl: ((...args: TArgs) => TReturn) | null = null
): SpyFn<TArgs, TReturn> {
  const calls: TArgs[] = [];
  const returnValueQueue: TReturn[] = [];
  const implQueue: Array<(...args: TArgs) => TReturn> = [];

  let returnValue: TReturn = undefined as TReturn;
  let impl: ((...args: TArgs) => TReturn) | null = initialImpl;

  const fn = ((...args: TArgs): TReturn => {
    calls.push(args);

    // Check queued implementations first
    const queuedImpl = implQueue.shift();
    if (queuedImpl) {
      return queuedImpl(...args);
    }

    // Check queued return values
    const queuedReturn = returnValueQueue.shift();
    if (queuedReturn !== undefined) {
      return queuedReturn;
    }

    // Use implementation if set
    if (impl) {
      return impl(...args);
    }

    return returnValue;
  }) as SpyFn<TArgs, TReturn>;

  Object.defineProperties(fn, {
    calls: { get: () => calls },
    callCount: { get: () => calls.length },
    called: { get: () => calls.length > 0 },
    lastCall: { get: () => calls.at(-1) },
    firstCall: { get: () => calls[0] },
  });

  fn.reset = () => {
    calls.length = 0;
    returnValueQueue.length = 0;
    implQueue.length = 0;
    return fn;
  };

  fn.mockReturnValue = (value: TReturn) => {
    returnValue = value;
    impl = null;
    return fn;
  };

  fn.mockReturnValueOnce = (value: TReturn) => {
    returnValueQueue.push(value);
    return fn;
  };

  fn.mockImplementation = (newImpl: (...args: TArgs) => TReturn) => {
    impl = newImpl;
    return fn;
  };

  fn.mockImplementationOnce = (newImpl: (...args: TArgs) => TReturn) => {
    implQueue.push(newImpl);
    return fn;
  };

  fn.mockResolvedValue = (value: Awaited<TReturn>) => {
    impl = (() => Promise.resolve(value)) as (...args: TArgs) => TReturn;
    return fn;
  };

  fn.mockResolvedValueOnce = (value: Awaited<TReturn>) => {
    implQueue.push((() => Promise.resolve(value)) as (...args: TArgs) => TReturn);
    return fn;
  };

  fn.mockRejectedValue = (error: unknown) => {
    impl = (() => Promise.reject(error)) as (...args: TArgs) => TReturn;
    return fn;
  };

  fn.mockRejectedValueOnce = (error: unknown) => {
    implQueue.push((() => Promise.reject(error)) as (...args: TArgs) => TReturn);
    return fn;
  };

  fn.calledWith = (...args: TArgs) => {
    return calls.some(
      (call) => call.length === args.length && call.every((arg, i) => arg === args[i])
    );
  };

  fn.nthCall = (n: number) => calls[n];

  return fn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Creator - Auto-generate mocks from types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a partial mock object with type safety
 *
 * @example
 * ```ts
 * const mockLogger = mock<Logger>({
 *   info: spy(),
 *   error: spy(),
 * });
 * ```
 */
export function mock<T extends object>(overrides: Partial<T> = {}): T {
  return overrides as T;
}

/**
 * Create a complete mock with all methods as spies
 * Requires passing method names since TypeScript can't enumerate interface methods
 *
 * @example
 * ```ts
 * const mockLogger = autoMock<Logger>(['info', 'error', 'warn', 'debug']);
 * mockLogger.info("test"); // tracked by spy
 * ```
 */
export function autoMock<T extends object>(
  methodNames: Array<keyof T & string>
): T & { [K in keyof T]: T[K] extends AnyFunction ? SpyFn : T[K] } {
  const obj = {} as Record<string, SpyFn>;
  for (const name of methodNames) {
    obj[name] = spy();
  }
  return obj as T & { [K in keyof T]: T[K] extends AnyFunction ? SpyFn : T[K] };
}

// ─────────────────────────────────────────────────────────────────────────────
// TestBed - Fluent DI Testing Container
// ─────────────────────────────────────────────────────────────────────────────

interface ProviderValue {
  __useClass?: Constructor;
  __useFactory?: () => unknown;
}

class TestBedBuilder {
  readonly #providers = new Map<Constructor, unknown>();
  #compiled = false;

  /**
   * Provide a mock value for a service
   *
   * @example
   * ```ts
   * TestBed.create()
   *   .mock(Logger, { info: spy(), error: spy() })
   *   .compile();
   * ```
   */
  mock<T extends object>(token: Constructor<T>, value: Partial<T>): this {
    this.#providers.set(token, value);
    return this;
  }

  /**
   * Provide a complete value for a service
   */
  provide<T>(token: Constructor<T>, value: T): this {
    this.#providers.set(token, value);
    return this;
  }

  /**
   * Use a different class implementation
   */
  useClass<T>(token: Constructor<T>, impl: Constructor<T>): this {
    // Resolve the impl and register
    this.#providers.set(token, { __useClass: impl } satisfies ProviderValue);
    return this;
  }

  /**
   * Use a factory function
   */
  useFactory<T>(token: Constructor<T>, factory: () => T): this {
    this.#providers.set(token, { __useFactory: factory } satisfies ProviderValue);
    return this;
  }

  /**
   * Compile the test module - must be called before getting services
   */
  compile(): void {
    container.reset();

    for (const [token, value] of this.#providers) {
      const providerValue = value as ProviderValue | undefined;
      if (providerValue?.__useClass) {
        container.register(token, { useClass: providerValue.__useClass });
      } else if (providerValue?.__useFactory) {
        container.register(token, { useFactory: providerValue.__useFactory });
      } else {
        container.registerInstance(token, value);
      }
    }

    this.#compiled = true;
  }
}

class TestBedStatic {
  #builder: TestBedBuilder | null = null;

  /**
   * Create a new test module builder
   *
   * @example
   * ```ts
   * TestBed.create()
   *   .mock(Logger, { info: spy() })
   *   .provide(HubConfig, new HubConfig())
   *   .compile();
   * ```
   */
  create(): TestBedBuilder {
    this.#builder = new TestBedBuilder();
    return this.#builder;
  }

  /**
   * Simple setup - configure and compile in one call
   *
   * @example
   * ```ts
   * TestBed.setup({
   *   mocks: {
   *     [Logger]: { info: spy(), error: spy() },
   *   },
   *   providers: {
   *     [HubConfig]: new HubConfig(),
   *   },
   * });
   * ```
   */
  setup(
    _config: { mocks?: Record<string, Partial<object>>; providers?: Record<string, unknown> } = {}
  ): void {
    container.reset();

    // Note: This simplified API requires tokens to be passed differently
    // For now, use the fluent API for full type safety
  }

  /**
   * Get a service from the test container
   */
  get<T>(token: Constructor<T>): T {
    return container.resolve(token);
  }

  /**
   * Alias for get() - matches Angular naming
   */
  inject<T>(token: Constructor<T>): T {
    return this.get(token);
  }

  /**
   * Reset the test container - call in afterEach
   */
  reset(): void {
    container.reset();
    this.#builder = null;
  }
}

export const TestBed = new TestBedStatic();
