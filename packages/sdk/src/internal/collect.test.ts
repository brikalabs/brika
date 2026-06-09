import { afterEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { dynamicDropdown } from '../blocks/schema-types';
import {
  collectBlock,
  collectBrick,
  collectSpark,
  drainCollector,
  installCollector,
  isZodSchema,
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

  test('captures bricks between install and drain', () => {
    installCollector();
    collectBrick({
      id: 'my-brick',
      meta: { name: 'My Brick', category: 'display' },
      config: z.object({ label: z.string() }),
      data: z.object({ value: z.number() }),
    });

    const result = drainCollector();
    expect(result.bricks).toHaveLength(1);
    expect(result.bricks[0]?.id).toBe('my-brick');
    expect(result.bricks[0]?.meta.name).toBe('My Brick');
  });

  test('collectBrick is a no-op when no collector is installed', () => {
    collectBrick({
      id: 'orphan-brick',
      meta: { name: 'Orphan', category: 'display' },
      config: z.object({}),
      data: z.object({}),
    });
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

  test('lowers a dynamicDropdown() field to a dynamic-dropdown entry', () => {
    const schema = z.object({ device: dynamicDropdown({ label: 'Device' }) });
    const { preferences, warnings } = zodToPreferences(schema);
    expect(warnings).toEqual([]);
    expect(preferences).toEqual([
      { type: 'dynamic-dropdown', name: 'device', label: 'Device', required: true },
    ]);
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

describe('isZodSchema', () => {
  test('returns true for real zod schemas', () => {
    expect(isZodSchema(z.string())).toBe(true);
    expect(isZodSchema(z.object({ x: z.number() }))).toBe(true);
  });

  test('returns false for null', () => {
    expect(isZodSchema(null)).toBe(false);
  });

  test('returns false for primitives', () => {
    expect(isZodSchema(42)).toBe(false);
    expect(isZodSchema('schema')).toBe(false);
    expect(isZodSchema(undefined)).toBe(false);
  });

  test('returns false for plain objects without safeParse', () => {
    expect(isZodSchema({ type: 'string' })).toBe(false);
  });

  test('returns false for object where safeParse is not a function', () => {
    expect(isZodSchema({ safeParse: 'not-a-function' })).toBe(false);
  });

  test('returns true for duck-typed schema-like objects', () => {
    expect(isZodSchema({ safeParse: () => ({ success: true, data: null }) })).toBe(true);
  });
});

describe('zodToPreferences: non-object schema fallback', () => {
  test('returns empty preferences for a non-object schema (no properties)', () => {
    // z.string() produces { type: 'string' } with no 'properties'; the function
    // parses it successfully (properties is optional) and returns an empty list.
    const result = zodToPreferences(z.string());
    expect(result.preferences).toEqual([]);
    // No warnings expected since the conversion succeeds cleanly.
    expect(result.warnings).toEqual([]);
  });

  test('password format on a string field produces password type', () => {
    const schema = z.object({
      token: z.string().meta({ format: 'password' }),
    });
    const { preferences } = zodToPreferences(schema);
    expect(preferences).toContainEqual(
      expect.objectContaining({ type: 'password', name: 'token' })
    );
  });
});
