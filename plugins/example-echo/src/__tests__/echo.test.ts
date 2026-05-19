import { describe, expect, test } from 'bun:test';
import { createMockBlockContext } from '@brika/sdk/testing';
import { echo } from '../index';

describe('echo block — D5 harness smoke test', () => {
  test('passes input straight through with no prefix/suffix', async () => {
    const h = createMockBlockContext(echo, { config: {} });
    await h.start();
    h.push('in', { hello: 'world' });
    await h.flush();
    expect(h.emitted('out')).toEqual([{ hello: 'world' }]);
    await h.stop();
  });

  test('applies prefix and suffix to string inputs', async () => {
    const h = createMockBlockContext(echo, {
      config: { prefix: '[', suffix: ']' },
    });
    await h.start();
    h.push('in', 'hi');
    h.push('in', 'there');
    await h.flush();
    expect(h.emitted('out')).toEqual(['[hi]', '[there]']);
    await h.stop();
  });

  test('clear() resets the emitted buffer', async () => {
    const h = createMockBlockContext(echo, { config: {} });
    await h.start();
    h.push('in', 'first');
    await h.flush();
    expect(h.emitted('out')).toHaveLength(1);
    h.clear('out');
    expect(h.emitted('out')).toEqual([]);
    await h.stop();
  });
});
