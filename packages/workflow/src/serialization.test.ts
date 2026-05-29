/**
 * Tests for serialization re-exports.
 *
 * The workflow package re-exports the full `@brika/serializable` API. These
 * tests pull on every public surface so the engine's serialization layer is
 * exercised end-to-end from the workflow's perspective (sync, async, built-in
 * collections, custom transformers, and the zod schema).
 */

import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  assertSerializable,
  BlobTransformer,
  BufferTransformer,
  defaultRegistry,
  deserialize,
  deserializeSync,
  isSerializable,
  registerTransformer,
  SerializableSchema,
  serialize,
  serializeSync,
  type Transformer,
  Uint8ArrayTransformer,
} from './serialization';

describe('serialize/deserialize (async)', () => {
  test('round-trips primitives', async () => {
    const data = {
      str: 'hello',
      num: 42,
      bool: true,
      empty: null,
    };
    const json = await serialize(data);
    expect(JSON.parse(json)).toEqual(data);
    const back = await deserialize<typeof data>(json);
    expect(back).toEqual(data);
  });

  test('round-trips Date through wrapper', async () => {
    const when = new Date('2025-01-02T03:04:05Z');
    const json = await serialize({
      when,
    });
    const back = await deserialize<{
      when: Date;
    }>(json);
    expect(back.when).toBeInstanceOf(Date);
    expect(back.when.toISOString()).toBe(when.toISOString());
  });

  test('round-trips Map with nested Date values', async () => {
    const map = new Map<string, Date>([['a', new Date('2025-01-01T00:00:00Z')]]);
    const json = await serialize(map);
    const back = await deserialize<Map<string, Date>>(json);
    expect(back).toBeInstanceOf(Map);
    expect(back.get('a')).toBeInstanceOf(Date);
    expect(back.get('a')?.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  test('round-trips Set', async () => {
    const set = new Set([1, 2, 3]);
    const json = await serialize(set);
    const back = await deserialize<Set<number>>(json);
    expect(back).toBeInstanceOf(Set);
    expect([...back].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  test('round-trips arrays of mixed serializables', async () => {
    const data = [1, 'two', null, true, new Date('2024-06-01T00:00:00Z')];
    const json = await serialize(data);
    const back = await deserialize<unknown[]>(json);
    expect(back).toHaveLength(5);
    expect(back[4]).toBeInstanceOf(Date);
  });

  test('round-trips Uint8Array via built-in transformer', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const json = await serialize({
      bytes,
    });
    const back = await deserialize<{
      bytes: Uint8Array;
    }>(json);
    expect(back.bytes).toBeInstanceOf(Uint8Array);
    expect([...back.bytes]).toEqual([1, 2, 3, 4]);
  });

  test('round-trips Buffer via built-in transformer', async () => {
    const buf = Buffer.from('hello');
    const json = await serialize({
      buf,
    });
    const back = await deserialize<{
      buf: Buffer;
    }>(json);
    expect(Buffer.isBuffer(back.buf)).toBe(true);
    expect(back.buf.toString('utf8')).toBe('hello');
  });

  test('round-trips Blob via async transformer', async () => {
    const blob = new Blob(['hello world'], {
      type: 'text/plain',
    });
    const json = await serialize({
      blob,
    });
    const back = await deserialize<{
      blob: Blob;
    }>(json);
    expect(back.blob).toBeInstanceOf(Blob);
    expect(back.blob.type).toContain('text/plain');
    expect(await back.blob.text()).toBe('hello world');
  });

  test('passes null and undefined through unchanged', async () => {
    expect(await serialize(null)).toBe('null');
    expect(await deserialize(await serialize(null))).toBeNull();
    // undefined inside a parent serializes to nothing (stringified to undefined)
    const wrapped = await serialize({
      a: undefined,
    });
    expect(JSON.parse(wrapped)).toEqual({});
  });

  test('leaves unknown serialized type markers intact on deserialize', async () => {
    const wire = JSON.stringify({
      __brika_type__: 'NotRegistered',
      data: {
        hello: 'world',
      },
    });
    const back = await deserialize<{
      __brika_type__: string;
      data: {
        hello: string;
      };
    }>(wire);
    expect(back.__brika_type__).toBe('NotRegistered');
    expect(back.data).toEqual({
      hello: 'world',
    });
  });
});

describe('serializeSync/deserializeSync', () => {
  test('round-trips primitives, Date, Map, Set, arrays, objects', () => {
    const data = {
      n: 1,
      d: new Date('2025-05-06T07:08:09Z'),
      m: new Map<string, number>([['k', 9]]),
      s: new Set([10, 20]),
      arr: [1, new Date('2024-01-01T00:00:00Z'), null],
      nested: {
        flag: true,
      },
    };
    const json = serializeSync(data);
    const back = deserializeSync<typeof data>(json);
    expect(back.n).toBe(1);
    expect(back.d).toBeInstanceOf(Date);
    expect(back.m).toBeInstanceOf(Map);
    expect(back.m.get('k')).toBe(9);
    expect(back.s).toBeInstanceOf(Set);
    expect(back.arr[1]).toBeInstanceOf(Date);
    expect(back.nested.flag).toBe(true);
  });

  test('serializeSync throws for async (Blob) values', () => {
    const blob = new Blob(['x']);
    expect(() => serializeSync(blob)).toThrow(/sync serialize async/i);
  });

  test('sync round-trips Uint8Array', () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const back = deserializeSync<Uint8Array>(serializeSync(bytes));
    expect(back).toBeInstanceOf(Uint8Array);
    expect([...back]).toEqual([9, 8, 7]);
  });

  test('sync passes null/undefined through', () => {
    expect(deserializeSync(serializeSync(null))).toBeNull();
    expect(serializeSync(undefined)).toBeUndefined();
  });

  test('sync leaves unknown markers intact on deserialize', () => {
    const wire = JSON.stringify({
      __brika_type__: 'NotRegistered',
      data: 42,
    });
    const back = deserializeSync<{
      __brika_type__: string;
      data: number;
    }>(wire);
    expect(back.__brika_type__).toBe('NotRegistered');
    expect(back.data).toBe(42);
  });
});

describe('isSerializable / assertSerializable', () => {
  test('isSerializable returns true for serializable data', async () => {
    expect(
      await isSerializable({
        hello: 'world',
      })
    ).toBe(true);
    expect(await isSerializable([1, 2, 3])).toBe(true);
    expect(await isSerializable(new Date())).toBe(true);
  });

  test('isSerializable returns false when serialize throws', async () => {
    // Functions are not serializable through the default registry's recursion
    // (they sit in the object branch but JSON.stringify drops them — that
    // actually succeeds). Use a circular reference to trigger a real throw.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(await isSerializable(cyclic)).toBe(false);
  });

  test('assertSerializable resolves for serializable data', async () => {
    await expect(
      assertSerializable({
        ok: true,
      })
    ).resolves.toBeUndefined();
  });

  test('assertSerializable rejects for non-serializable data', async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(assertSerializable(cyclic)).rejects.toThrow(/not serializable/i);
  });
});

describe('custom transformers', () => {
  // Use a unique name per transformer to avoid clashing with built-ins / other
  // tests running in the same process.
  test('registerTransformer wires a sync transformer into the default registry', async () => {
    class Currency {
      constructor(
        public readonly amount: number,
        public readonly code: string
      ) {}
    }

    const transformer: Transformer<Currency, { amount: number; code: string }> = {
      name: 'TestCurrencySync',
      isApplicable: (v): v is Currency => v instanceof Currency,
      serialize: (v) => ({
        amount: v.amount,
        code: v.code,
      }),
      deserialize: (data) => new Currency(data.amount, data.code),
    };

    registerTransformer(transformer);

    const json = await serialize({
      price: new Currency(99, 'USD'),
    });
    const back = await deserialize<{
      price: Currency;
    }>(json);
    expect(back.price).toBeInstanceOf(Currency);
    expect(back.price.amount).toBe(99);
    expect(back.price.code).toBe('USD');

    const syncBack = deserializeSync<{
      price: Currency;
    }>(
      serializeSync({
        price: new Currency(5, 'EUR'),
      })
    );
    expect(syncBack.price).toBeInstanceOf(Currency);
  });

  test('async transformer flips hasAsyncTransformers and is honoured by sync paths', async () => {
    class Token {
      constructor(public readonly value: string) {}
    }

    const transformer: Transformer<Token, string> = {
      name: 'TestTokenAsync',
      isAsync: true,
      isApplicable: (v): v is Token => v instanceof Token,
      serialize: async (v) => {
        await Promise.resolve();
        return v.value;
      },
      deserialize: async (data) => {
        await Promise.resolve();
        return new Token(data);
      },
    };

    defaultRegistry.register(transformer);
    expect(defaultRegistry.hasAsyncTransformers).toBe(true);

    // Async round-trip works.
    const json = await serialize({
      t: new Token('abc'),
    });
    const back = await deserialize<{
      t: Token;
    }>(json);
    expect(back.t).toBeInstanceOf(Token);
    expect(back.t.value).toBe('abc');

    // Sync serialize of an async value throws explicitly.
    expect(() => serializeSync(new Token('xyz'))).toThrow(/sync serialize async/i);

    // And sync deserialize of an async-marked payload throws too.
    const wire = JSON.stringify({
      __brika_type__: 'TestTokenAsync',
      data: 'xyz',
    });
    expect(() => deserializeSync(wire)).toThrow(/sync deserialize async/i);
  });

  test('built-in transformer constants are wired into the default registry', () => {
    expect(defaultRegistry.findByName('Uint8Array')).toBe(Uint8ArrayTransformer);
    expect(defaultRegistry.findByName('Buffer')).toBe(BufferTransformer);
    expect(defaultRegistry.findByName('Blob')).toBe(BlobTransformer);
  });

  test('findForValue returns the matching transformer for a built-in', () => {
    const tf = defaultRegistry.findForValue(new Uint8Array([1]));
    expect(tf?.name).toBe('Uint8Array');
  });

  test('findForValue returns undefined for a value with no matching transformer', () => {
    expect(
      defaultRegistry.findForValue({
        not: 'special',
      })
    ).toBeUndefined();
  });
});

describe('SerializableSchema (zod)', () => {
  test('accepts plain primitives', () => {
    expect(SerializableSchema.safeParse('hello').success).toBe(true);
    expect(SerializableSchema.safeParse(42).success).toBe(true);
    expect(SerializableSchema.safeParse(true).success).toBe(true);
    expect(SerializableSchema.safeParse(null).success).toBe(true);
  });

  test('accepts Date', () => {
    expect(SerializableSchema.safeParse(new Date()).success).toBe(true);
  });

  test('accepts arrays, records, Map, Set', () => {
    expect(SerializableSchema.safeParse([1, 'a', null]).success).toBe(true);
    expect(
      SerializableSchema.safeParse({
        a: 'b',
      }).success
    ).toBe(true);
    expect(SerializableSchema.safeParse(new Map([['k', 1]])).success).toBe(true);
    expect(SerializableSchema.safeParse(new Set([1, 2])).success).toBe(true);
  });

  test('accepts Uint8Array and Blob', () => {
    expect(SerializableSchema.safeParse(new Uint8Array([0, 1, 2])).success).toBe(true);
    expect(SerializableSchema.safeParse(new Blob([])).success).toBe(true);
  });

  test('rejects functions and symbols', () => {
    expect(SerializableSchema.safeParse(() => 1).success).toBe(false);
    expect(SerializableSchema.safeParse(Symbol('x')).success).toBe(false);
  });

  test('composes inside larger zod schemas', () => {
    const schema = z.object({
      payload: SerializableSchema,
    });
    expect(
      schema.safeParse({
        payload: {
          a: [1, 'two', null],
        },
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({
        payload: () => 1,
      }).success
    ).toBe(false);
  });
});
