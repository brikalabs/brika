import { describe, expect, test } from 'bun:test';
import { BlockDefinition } from './blocks';

const base = {
  id: 'clock',
  name: 'Clock',
  category: 'trigger',
  inputs: [],
  outputs: [{ id: 'tick', name: 'Tick' }],
};

describe('BlockDefinition.trigger forward-compat', () => {
  test('accepts a known interval trigger', () => {
    const result = BlockDefinition.safeParse({
      ...base,
      trigger: { kind: 'interval', intervalField: 'interval', output: 'tick' },
    });
    expect(result.success).toBeTrue();
    if (result.success) {
      expect(result.data.trigger).toEqual({
        kind: 'interval',
        intervalField: 'interval',
        output: 'tick',
      });
    }
  });

  test('a block with no trigger parses with trigger undefined', () => {
    const result = BlockDefinition.safeParse(base);
    expect(result.success).toBeTrue();
    if (result.success) {
      expect(result.data.trigger).toBeUndefined();
    }
  });

  test('an UNKNOWN future kind degrades to undefined without dropping the block', () => {
    // This is the load-bearing forward-compat guarantee: a newer plugin
    // declaring e.g. a `cron` trigger must still register on an older hub,
    // falling back to its in-plugin behaviour rather than vanishing.
    const result = BlockDefinition.safeParse({
      ...base,
      trigger: { kind: 'cron', expr: '* * * * *', output: 'tick' },
    });
    expect(result.success).toBeTrue();
    if (result.success) {
      expect(result.data.id).toBe('clock');
      expect(result.data.trigger).toBeUndefined();
    }
  });
});
