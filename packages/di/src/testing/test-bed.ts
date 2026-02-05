/**
 * TestBed - DI testing utility for mock injection and spy management.
 */

import 'reflect-metadata';
import { container } from '../core/container';
import { createDeepStub } from './deep-stub';
import type { Constructor, DeepPartial } from './types';

/** Minimal interface for restorable spies */
interface Restorable {
  mockRestore(): void;
}

class TestBedImpl {
  #providers = new Map<Constructor, unknown>();
  #spies: Restorable[] = [];
  #autoStub = false;
  #originalResolve: typeof container.resolve | null = null;

  /** Enable/disable auto-stubbing mode. */
  autoStub(enabled = true): this {
    if (enabled && !this.#autoStub) {
      this.#enableAutoStub();
    } else if (!enabled && this.#autoStub) {
      this.#disableAutoStub();
    }
    return this;
  }

  #enableAutoStub(): void {
    this.#autoStub = true;
    this.#originalResolve = container.resolve.bind(container);
    container.resolve = <T>(token: Constructor<T>) => {
      if (!this.#providers.has(token)) {
        this.stub(token);
      }
      return this.#originalResolve!(token);
    };
  }

  #disableAutoStub(): void {
    this.#autoStub = false;
    if (this.#originalResolve) {
      container.resolve = this.#originalResolve;
      this.#originalResolve = null;
    }
  }

  /** Create and register a deep stub for a service. */
  stub<T>(token: Constructor<T>, overrides: DeepPartial<T> = {} as DeepPartial<T>): T {
    const stub = createDeepStub<T>(overrides as Partial<T>);
    this.provide(token, stub);
    return stub;
  }

  /** Stub multiple services at once. */
  stubAll(...tokens: Constructor[]): this {
    tokens.forEach((token) => this.stub(token));
    return this;
  }

  /** Register a mock value for a service. */
  provide<T>(token: Constructor<T>, value: T | Partial<T>): this {
    if (this.#providers.size === 0) {
      container.reset();
    }
    this.#providers.set(token, value);
    container.registerInstance(token, value);
    return this;
  }

  /** Resolve a service from the container. */
  get<T>(token: Constructor<T>): T {
    return container.resolve(token);
  }

  /**
   * Track a spy for automatic cleanup on reset.
   * @example trackSpy(spyOn(Bun, 'file').mockImplementation(...));
   */
  trackSpy<T extends Restorable>(spy: T): T {
    this.#spies.push(spy);
    return spy;
  }

  /** Reset the container and restore all spies. */
  reset(): void {
    // Restore all tracked spies
    for (const spy of this.#spies) {
      spy.mockRestore();
    }
    this.#spies.length = 0;

    // Reset DI container
    this.#disableAutoStub();
    container.reset();
    this.#providers.clear();
  }
}

/** Global TestBed singleton used by useTestBed() and helpers. */
export const TestBed = new TestBedImpl();
