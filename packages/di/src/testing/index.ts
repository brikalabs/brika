/**
 * @brika/di/testing - DI testing utilities
 */

export { createDeepStub } from './deep-stub';
export type { Constructor, DeepPartial } from './types';
export { useTestBed } from './use-test-bed';

// ─────────────────────────────────────────────────────────────────────────────
// Standalone helpers - delegate to TestBed singleton
// ─────────────────────────────────────────────────────────────────────────────

import { TestBed } from './test-bed';
import type { Constructor, DeepPartial } from './types';

/** Create and register a deep stub for a service. */
export function stub<T>(token: Constructor<T>, overrides?: DeepPartial<T>): T {
  return TestBed.stub(token, overrides);
}

/** Stub multiple services at once. */
export function stubAll(...tokens: Constructor[]): void {
  TestBed.stubAll(...tokens);
}

/** Register a mock value for a service. */
export function provide<T>(token: Constructor<T>, value: T | Partial<T>): void {
  TestBed.provide(token, value);
}

/** Resolve a service from the container. */
export function get<T>(token: Constructor<T>): T {
  return TestBed.get(token);
}

/** Reset the container (usually handled by useTestBed automatically). */
export function reset(): void {
  TestBed.reset();
}
