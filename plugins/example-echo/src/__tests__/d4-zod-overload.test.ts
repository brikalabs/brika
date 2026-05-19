import { describe, expect, test } from 'bun:test';
import {
  defineReactiveBlock,
  getPreferences,
  input,
  InvalidInputError,
  output,
  z,
} from '@brika/sdk';
import { createMockBlockContext } from '@brika/sdk/testing';

// Block that reads a typed preference via the new D4 overload.
const Prefs = z.object({ apiKey: z.string(), debug: z.boolean() });

const readPrefBlock = defineReactiveBlock(
  {
    id: 'read-pref',
    inputs: { trigger: input(z.generic(), { name: 'Trigger' }) },
    outputs: { key: output(z.generic(), { name: 'Key' }) },
    config: z.object({}),
  },
  ({ inputs, outputs }) => {
    inputs.trigger.on(() => {
      const prefs = getPreferences(Prefs);
      outputs.key.emit(prefs.apiKey);
    });
  }
);

describe('D4 — getPreferences(schema) end-to-end via real plugin block', () => {
  test('valid prefs are returned typed', async () => {
    const h = createMockBlockContext(readPrefBlock, {
      config: {},
      preferences: { apiKey: 'sk-123', debug: true },
    });
    await h.start();
    h.push('trigger', null);
    await h.flush();
    expect(h.emitted('key')).toEqual(['sk-123']);
    await h.stop();
  });

  test('schema mismatch throws InvalidInputError with the failing path', async () => {
    const h = createMockBlockContext(readPrefBlock, {
      config: {},
      preferences: { apiKey: 123, debug: 'no' },
    });
    await h.start();
    let caught: unknown = null;
    try {
      h.push('trigger', null);
      await h.flush();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InvalidInputError);
    expect(caught instanceof Error ? caught.message : '').toContain('apiKey');
    await h.stop();
  });
});
