/**
 * Tests for SerializableSchema
 */

import { describe, expect, test } from 'bun:test';
import { SerializableSchema } from '../schema';

describe('SerializableSchema', () => {
  describe('primitives', () => {
    test('accepts null', () => {
      const result = SerializableSchema.safeParse(null);
      expect(result.success).toBe(true);
    });

    test('accepts boolean', () => {
      expect(SerializableSchema.safeParse(true).success).toBe(true);
      expect(SerializableSchema.safeParse(false).success).toBe(true);
    });

    test('accepts number', () => {
      expect(SerializableSchema.safeParse(42).success).toBe(true);
      expect(SerializableSchema.safeParse(3.14).success).toBe(true);
      expect(SerializableSchema.safeParse(-100).success).toBe(true);
      expect(SerializableSchema.safeParse(0).success).toBe(true);
    });

    test('accepts string', () => {
      expect(SerializableSchema.safeParse('hello').success).toBe(true);
      expect(SerializableSchema.safeParse('').success).toBe(true);
    });

    test('accepts Date', () => {
      const result = SerializableSchema.safeParse(new Date());
      expect(result.success).toBe(true);
    });
  });

  describe('binary types', () => {
    test('accepts Uint8Array', () => {
      const result = SerializableSchema.safeParse(new Uint8Array([1, 2, 3]));
      expect(result.success).toBe(true);
    });

    test('accepts Blob', () => {
      const result = SerializableSchema.safeParse(new Blob(['test']));
      expect(result.success).toBe(true);
    });
  });

  describe('collections', () => {
    test('accepts array of primitives', () => {
      expect(SerializableSchema.safeParse([1, 2, 3]).success).toBe(true);
      expect(SerializableSchema.safeParse(['a', 'b', 'c']).success).toBe(true);
      expect(SerializableSchema.safeParse([true, false]).success).toBe(true);
    });

    test('accepts nested arrays', () => {
      const result = SerializableSchema.safeParse([
        [1, 2],
        [3, 4],
      ]);
      expect(result.success).toBe(true);
    });

    test('accepts record/object', () => {
      const result = SerializableSchema.safeParse({
        name: 'test',
        value: 42,
        active: true,
      });
      expect(result.success).toBe(true);
    });

    test('accepts nested objects', () => {
      const result = SerializableSchema.safeParse({
        user: {
          name: 'John',
          settings: {
            theme: 'dark',
            notifications: true,
          },
        },
      });
      expect(result.success).toBe(true);
    });

    test('accepts Map', () => {
      const map = new Map<string, number>();
      map.set('a', 1);
      map.set('b', 2);
      const result = SerializableSchema.safeParse(map);
      expect(result.success).toBe(true);
    });

    test('accepts Map with complex values', () => {
      const map = new Map<string, object>();
      map.set('config', { enabled: true });
      const result = SerializableSchema.safeParse(map);
      expect(result.success).toBe(true);
    });

    test('accepts Set', () => {
      const set = new Set([1, 2, 3]);
      const result = SerializableSchema.safeParse(set);
      expect(result.success).toBe(true);
    });

    test('accepts Set with complex values', () => {
      const set = new Set(['a', 'b', 'c']);
      const result = SerializableSchema.safeParse(set);
      expect(result.success).toBe(true);
    });
  });

  describe('mixed types', () => {
    test('accepts array of mixed types', () => {
      const result = SerializableSchema.safeParse([1, 'two', true, null]);
      expect(result.success).toBe(true);
    });

    test('accepts object with mixed value types', () => {
      const result = SerializableSchema.safeParse({
        number: 42,
        string: 'hello',
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: { key: 'value' },
      });
      expect(result.success).toBe(true);
    });

    test('accepts deeply nested structure', () => {
      const result = SerializableSchema.safeParse({
        level1: {
          level2: {
            level3: {
              value: [1, 2, { deep: true }],
            },
          },
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid types', () => {
    test('rejects undefined', () => {
      const result = SerializableSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    test('rejects functions', () => {
      const result = SerializableSchema.safeParse(() => undefined);
      expect(result.success).toBe(false);
    });

    test('rejects symbols', () => {
      const result = SerializableSchema.safeParse(Symbol('test'));
      expect(result.success).toBe(false);
    });
  });
});
