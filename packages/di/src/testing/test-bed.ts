/**
 * TestBed - DI Testing Utility
 *
 * Provides mock injection for classes using tsyringe's `inject()`.
 */

import 'reflect-metadata';
import { container } from '../core/container';
import { createDeepStub } from './deep-stub';
import type { Constructor, DeepPartial } from './types';

class TestBedImpl {
  #providers = new Map<Constructor, unknown>();

  /**
   * Create a deep stub for a service and register it.
   * All methods return no-ops, property access returns nested stubs.
   * Overrides are merged with auto-stubs - only specify what you need.
   *
   * @example
   * TestBed.stub(Logger);  // All methods auto-stubbed
   *
   * @example With partial override
   * TestBed.stub(Logger, {
   *   withSource: () => ({ error: captureError })  // info, warn auto-stubbed
   * });
   */
  stub<T>(token: Constructor<T>, overrides: DeepPartial<T> = {} as DeepPartial<T>): T {
    const stub = createDeepStub<T>(overrides as Partial<T>);
    this.provide(token, stub);
    return stub;
  }

  /**
   * Provide a mock/value for a service.
   * Call reset() before first provide() to clear singleton cache.
   */
  provide<T>(token: Constructor<T>, value: T | Partial<T>): this {
    // Reset on first provide to clear any cached singletons
    if (this.#providers.size === 0) {
      container.reset();
    }
    this.#providers.set(token, value);
    container.registerInstance(token, value);
    return this;
  }

  /**
   * Get a service from the container.
   */
  get<T>(token: Constructor<T>): T {
    return container.resolve(token);
  }

  /**
   * Alias for get().
   */
  inject<T>(token: Constructor<T>): T {
    return this.get(token);
  }

  /**
   * Reset the container for the next test.
   */
  reset(): void {
    container.reset();
    this.#providers.clear();
  }
}

export const TestBed = new TestBedImpl();
