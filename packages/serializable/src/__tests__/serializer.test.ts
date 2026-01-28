/**
 * Tests for serializer
 */

import { describe, expect, test } from 'bun:test';
import {
  assertSerializable,
  deserialize,
  deserializeSync,
  isSerializable,
  serialize,
  serializeSync,
} from '../serializer';

describe('serialize/deserialize', () => {
  test('serializes and deserializes primitives', async () => {
    const data = {
      string: 'hello',
      number: 42,
      boolean: true,
      null: null,
    };

    const json = await serialize(data);
    const result = await deserialize(json);

    expect(result).toEqual(data);
  });

  test('serializes and deserializes arrays', async () => {
    const data = [1, 2, 3, 'four', true];

    const json = await serialize(data);
    const result = await deserialize(json);

    expect(result).toEqual(data);
  });

  test('serializes and deserializes nested objects', async () => {
    const data = {
      level1: {
        level2: {
          value: 'deep',
        },
      },
    };

    const json = await serialize(data);
    const result = await deserialize(json);

    expect(result).toEqual(data);
  });

  test('serializes Date objects', async () => {
    const data = { date: new Date('2024-01-15T12:00:00Z') };

    const json = await serialize(data);
    const result = await deserialize<{ date: Date }>(json);

    expect(result.date).toBeInstanceOf(Date);
    expect(result.date.toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  test('serializes Map objects', async () => {
    const data = {
      map: new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ]),
    };

    const json = await serialize(data);
    const result = await deserialize<{ map: Map<string, string> }>(json);

    expect(result.map).toBeInstanceOf(Map);
    expect(result.map.get('key1')).toBe('value1');
    expect(result.map.get('key2')).toBe('value2');
  });

  test('serializes Set objects', async () => {
    const data = { set: new Set([1, 2, 3]) };

    const json = await serialize(data);
    const result = await deserialize<{ set: Set<number> }>(json);

    expect(result.set).toBeInstanceOf(Set);
    expect(result.set.has(1)).toBe(true);
    expect(result.set.has(2)).toBe(true);
    expect(result.set.has(3)).toBe(true);
  });
});

describe('serializeSync/deserializeSync', () => {
  test('serializes and deserializes primitives synchronously', () => {
    const data = { value: 42 };

    const json = serializeSync(data);
    const result = deserializeSync(json);

    expect(result).toEqual(data);
  });

  test('handles Date synchronously', () => {
    const data = { date: new Date('2024-01-15T12:00:00Z') };

    const json = serializeSync(data);
    const result = deserializeSync<{ date: Date }>(json);

    expect(result.date).toBeInstanceOf(Date);
  });
});

describe('assertSerializable', () => {
  test('does not throw for serializable data', async () => {
    await expect(assertSerializable({ valid: true })).resolves.toBeUndefined();
  });

  test('throws for non-serializable data', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(assertSerializable(circular)).rejects.toThrow('not serializable');
  });
});

describe('isSerializable', () => {
  test('returns true for serializable data', async () => {
    const result = await isSerializable({ valid: true });
    expect(result).toBe(true);
  });

  test('returns false for circular references', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const result = await isSerializable(circular);
    expect(result).toBe(false);
  });
});
