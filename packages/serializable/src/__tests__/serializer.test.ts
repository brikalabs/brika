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
    const data = [
      1,
      2,
      3,
      'four',
      true,
    ];

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
    const data = {
      date: new Date('2024-01-15T12:00:00Z'),
    };

    const json = await serialize(data);
    const result = await deserialize<{
      date: Date;
    }>(json);

    expect(result.date).toBeInstanceOf(Date);
    expect(result.date.toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  test('serializes Map objects', async () => {
    const data = {
      map: new Map([
        [
          'key1',
          'value1',
        ],
        [
          'key2',
          'value2',
        ],
      ]),
    };

    const json = await serialize(data);
    const result = await deserialize<{
      map: Map<string, string>;
    }>(json);

    expect(result.map).toBeInstanceOf(Map);
    expect(result.map.get('key1')).toBe('value1');
    expect(result.map.get('key2')).toBe('value2');
  });

  test('serializes Set objects', async () => {
    const data = {
      set: new Set([
        1,
        2,
        3,
      ]),
    };

    const json = await serialize(data);
    const result = await deserialize<{
      set: Set<number>;
    }>(json);

    expect(result.set).toBeInstanceOf(Set);
    expect(result.set.has(1)).toBe(true);
    expect(result.set.has(2)).toBe(true);
    expect(result.set.has(3)).toBe(true);
  });
});

describe('serializeSync/deserializeSync', () => {
  test('serializes and deserializes primitives synchronously', () => {
    const data = {
      value: 42,
    };

    const json = serializeSync(data);
    const result = deserializeSync(json);

    expect(result).toEqual(data);
  });

  test('handles Date synchronously', () => {
    const data = {
      date: new Date('2024-01-15T12:00:00Z'),
    };

    const json = serializeSync(data);
    const result = deserializeSync<{
      date: Date;
    }>(json);

    expect(result.date).toBeInstanceOf(Date);
  });
});

describe('assertSerializable', () => {
  test('does not throw for serializable data', async () => {
    await expect(
      assertSerializable({
        valid: true,
      })
    ).resolves.toBeUndefined();
  });

  test('throws for non-serializable data', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(assertSerializable(circular)).rejects.toThrow('not serializable');
  });
});

describe('isSerializable', () => {
  test('returns true for serializable data', async () => {
    const result = await isSerializable({
      valid: true,
    });
    expect(result).toBe(true);
  });

  test('returns false for circular references', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const result = await isSerializable(circular);
    expect(result).toBe(false);
  });
});

describe('TransformerRegistry', () => {
  const { TransformerRegistry, BlobTransformer, Uint8ArrayTransformer, BufferTransformer } =
    require('../transformer') as typeof import('../transformer');

  test('register sets hasAsyncTransformers when registering async transformer', () => {
    const registry = new TransformerRegistry();
    expect(registry.hasAsyncTransformers).toBe(false);

    registry.register(BlobTransformer);
    expect(registry.hasAsyncTransformers).toBe(true);
  });

  test('register does not set hasAsyncTransformers for sync transformer', () => {
    const registry = new TransformerRegistry();
    registry.register(Uint8ArrayTransformer);
    expect(registry.hasAsyncTransformers).toBe(false);
  });

  test('findByName returns transformer by name', () => {
    const registry = new TransformerRegistry();
    registry.register(Uint8ArrayTransformer);
    registry.register(BufferTransformer);

    expect(registry.findByName('Uint8Array')).toBe(Uint8ArrayTransformer);
    expect(registry.findByName('Buffer')).toBe(BufferTransformer);
    expect(registry.findByName('NonExistent')).toBeUndefined();
  });

  test('findForValue matches correct transformer', () => {
    const registry = new TransformerRegistry();
    registry.register(Uint8ArrayTransformer);
    registry.register(BufferTransformer);

    const buf = Buffer.from('hello');
    expect(registry.findForValue(buf)?.name).toBe('Buffer');

    const u8 = new Uint8Array([
      1,
      2,
      3,
    ]);
    expect(registry.findForValue(u8)?.name).toBe('Uint8Array');

    expect(registry.findForValue('not a buffer')).toBeUndefined();
  });
});

describe('BlobTransformer', () => {
  const { BlobTransformer } = require('../transformer') as typeof import('../transformer');

  test('serializes Blob to base64 with type', async () => {
    const blob = new Blob(
      [
        'hello world',
      ],
      {
        type: 'text/plain',
      }
    );

    const serialized = await BlobTransformer.serialize(blob);

    expect(serialized.type).toContain('text/plain');
    expect(typeof serialized.data).toBe('string');

    // Verify base64 round-trip
    const decoded = Buffer.from(serialized.data, 'base64').toString();
    expect(decoded).toBe('hello world');
  });

  test('deserializes base64 back to Blob', () => {
    const base64 = Buffer.from('hello world').toString('base64');
    const data = {
      data: base64,
      type: 'application/octet-stream',
    };

    const blob = BlobTransformer.deserialize(data) as Blob;

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/octet-stream');
  });

  test('isApplicable returns true for Blob', () => {
    expect(BlobTransformer.isApplicable(new Blob([]))).toBe(true);
    expect(BlobTransformer.isApplicable('not a blob')).toBe(false);
    // Buffer is not a Blob in Bun (it's a Uint8Array subclass)
    expect(BlobTransformer.isApplicable(Buffer.from('test'))).toBe(false);
  });

  test('isAsync is true', () => {
    expect(BlobTransformer.isAsync).toBe(true);
  });
});

describe('TransformerRegistry sync operations with async transformer', () => {
  const { TransformerRegistry, BlobTransformer } =
    require('../transformer') as typeof import('../transformer');

  test('serializeSync throws when async transformer matches', () => {
    const registry = new TransformerRegistry();
    registry.register(BlobTransformer);

    const blob = new Blob([
      'test',
    ]);
    expect(() => registry.serializeSync(blob)).toThrow('Cannot sync serialize async type');
  });

  test('deserializeCustomTypeSync throws for async transformer', () => {
    const registry = new TransformerRegistry();
    registry.register(BlobTransformer);

    // Manually construct a serialized Blob object
    const serialized = {
      __brika_type__: 'Blob',
      data: {
        data: Buffer.from('test').toString('base64'),
        type: 'text/plain',
      },
    };

    expect(() => registry.deserializeSync(serialized)).toThrow(
      'Cannot sync deserialize async type'
    );
  });

  test('deserializeSync returns unknown type as-is', () => {
    const registry = new TransformerRegistry();

    const unknown = {
      __brika_type__: 'UnknownType',
      data: 'something',
    };

    const result = registry.deserializeSync(unknown);
    expect(result).toEqual(unknown);
  });

  test('async deserialize returns unknown type as-is', async () => {
    const registry = new TransformerRegistry();

    const unknown = {
      __brika_type__: 'UnknownType',
      data: 'something',
    };

    const result = await registry.deserialize(unknown);
    expect(result).toEqual(unknown);
  });
});
