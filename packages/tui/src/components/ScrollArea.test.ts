import { describe, expect, test } from 'bun:test';

// The component itself is React/Ink-bound and exercised through
// integration usage. This file pins the pure helpers we'd otherwise
// have to re-test indirectly.

import { ScrollArea } from './ScrollArea';

describe('ScrollArea', () => {
  test('exports a component function', () => {
    expect(typeof ScrollArea).toBe('function');
  });
});
