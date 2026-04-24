import { describe, expect, test } from 'bun:test';

import { Input } from './input';

describe('Input', () => {
  test('exports the component', () => {
    expect(typeof Input).toBe('function');
  });
});
