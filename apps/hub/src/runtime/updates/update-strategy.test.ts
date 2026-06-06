/**
 * `resolveUpdateStrategy` hands back the strategy for the current runtime
 * mode. Under the test runner that resolves to the dev strategy (running
 * from source, not a compiled binary); the assertion stays mode-agnostic
 * so it holds wherever the suite runs.
 */

import { describe, expect, test } from 'bun:test';
import { resolveUpdateStrategy } from './update-strategy';

describe('resolveUpdateStrategy', () => {
  test('returns a strategy with the UpdateStrategy shape', () => {
    const strategy = resolveUpdateStrategy();
    expect(typeof strategy.name).toBe('string');
    expect(typeof strategy.canApply).toBe('function');
    expect(typeof strategy.apply).toBe('function');
  });
});
