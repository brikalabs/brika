import { afterEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  collectBlock,
  collectSpark,
  drainCollector,
  installCollector,
  parseBrickMeta,
  zodToPreferences,
} from './collect';

describe('build collector', () => {
  // Drain after every test so a leaked install never bleeds into the next.
  afterEach(() => {
    drainCollector();
  });

  test('records nothing when no collector is installed', () => {
    collectBlock({ id: 'x', meta: { name: 'X', category: 'trigger' } });
    collectSpark({ id: 'y' });
    expect(drainCollector()).toEqual({ blocks: [], sparks: [], bricks: [] });
  });

  test('captures blocks and sparks between install and drain', () => {
    installCollector();
    collectBlock({ id: 'timer', meta: { name: 'Timer', category: 'trigger' } });
    collectSpark({ id: 'tick', meta: { name: 'Tick' } });

    expect(drainCollector()).toEqual({
      blocks: [{ id: 'timer', meta: { name: 'Timer', category: 'trigger' } }],
      sparks: [{ id: 'tick', meta: { name: 'Tick' } }],
      bricks: [],
    });
  });

  test('drain stops capture until the next install', () => {
    installCollector();
    collectBlock({ id: 'a', meta: { name: 'X', category: 'flow' } });
    drainCollector();

    collectBlock({ id: 'b', meta: { name: 'X', category: 'flow' } });
    expect(drainCollector()).toEqual({ blocks: [], sparks: [], bricks: [] });
  });
});

describe('zodToPreferences', () => {
  test('lowers number constraints, label, description, and step', () => {
    const schema = z.object({
      refresh: z
        .number()
        .min(1000)
        .max(30000)
        .multipleOf(1000)
        .default(5000)
        .meta({ label: 'Refresh (ms)' })
        .describe('How often to refresh'),
    });

    const { preferences, warnings } = zodToPreferences(schema);

    expect(warnings).toEqual([]);
    expect(preferences).toEqual([
      {
        type: 'number',
        name: 'refresh',
        label: 'Refresh (ms)',
        description: 'How often to refresh',
        default: 5000,
        min: 1000,
        max: 30000,
        step: 1000,
      },
    ]);
  });

  test('maps boolean to checkbox and enum to dropdown', () => {
    const schema = z.object({
      muted: z.boolean().default(true),
      stream: z.enum(['a', 'b']).default('a'),
    });

    const { preferences } = zodToPreferences(schema);

    expect(preferences).toContainEqual({ type: 'checkbox', name: 'muted', default: true });
    expect(preferences).toContainEqual({
      type: 'dropdown',
      name: 'stream',
      default: 'a',
      options: [{ value: 'a' }, { value: 'b' }],
    });
  });

  test('marks a no-default required field and a plain string as text', () => {
    const schema = z.object({ token: z.string() });
    const { preferences } = zodToPreferences(schema);
    expect(preferences).toEqual([{ type: 'text', name: 'token', required: true }]);
  });

  test('warns and skips unsupported field types', () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const { preferences, warnings } = zodToPreferences(schema);
    expect(preferences).toEqual([]);
    expect(warnings.some((w) => w.includes('tags'))).toBe(true);
  });
});

describe('parseBrickMeta', () => {
  test('accepts valid meta', () => {
    const result = parseBrickMeta({ name: 'X', category: 'media', families: ['sm', 'lg'] });
    expect(result).toEqual({
      ok: true,
      meta: { name: 'X', category: 'media', families: ['sm', 'lg'] },
    });
  });

  test('rejects a non-object and a bad family', () => {
    expect(parseBrickMeta(undefined).ok).toBe(false);
    expect(parseBrickMeta({ families: ['xl'] }).ok).toBe(false);
  });
});
