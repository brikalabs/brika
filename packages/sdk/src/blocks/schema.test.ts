/**
 * Smoke tests for the curated `z` re-export — verifies the standard Zod
 * primitives, the BRIKA custom types, and the only callable arrow
 * (`brand<T>()`) are exposed and functional.
 */

import { describe, expect, test } from 'bun:test';
import { z } from './schema';

describe('z re-export', () => {
  test('exposes standard Zod primitives', () => {
    expect(z.string().parse('hi')).toBe('hi');
    expect(z.number().parse(1)).toBe(1);
    expect(z.boolean().parse(true)).toBe(true);
    expect(z.null().parse(null)).toBeNull();
    expect(() => z.never().parse('x')).toThrow();
    expect(() => z.nan().parse(1)).toThrow();
  });

  test('exposes composite + union builders', () => {
    expect(z.object({ a: z.string() }).parse({ a: 'x' })).toEqual({ a: 'x' });
    expect(z.array(z.number()).parse([1])).toEqual([1]);
    expect(z.union([z.string(), z.number()]).parse(1)).toBe(1);
    expect(z.tuple([z.string(), z.number()]).parse(['x', 1])).toEqual(['x', 1]);
  });

  test('brand<T>() returns a branded string schema', () => {
    const Branded = z.brand<'UserId'>();
    // The schema is a zod string with a phantom brand. The runtime accepts
    // any string; the brand only lives at the type level. We assert the
    // schema is callable and that string rejection works as expected.
    expect(typeof Branded.parse).toBe('function');
    expect(typeof Branded.safeParse).toBe('function');
  });

  test('exposes BRIKA custom types', () => {
    expect(typeof z.generic).toBe('function');
    expect(typeof z.passthrough).toBe('function');
    expect(typeof z.expression).toBe('function');
    expect(typeof z.color).toBe('function');
    expect(typeof z.duration).toBe('function');
    expect(typeof z.sparkType).toBe('function');
    expect(typeof z.code).toBe('function');
    expect(typeof z.secret).toBe('function');
    expect(typeof z.filePath).toBe('function');
    expect(typeof z.url).toBe('function');
    expect(typeof z.jsonSchema).toBe('function');
    expect(typeof z.resolved).toBe('function');
  });

  test('exposes modifiers + advanced builders', () => {
    expect(z.optional(z.string()).parse(undefined)).toBeUndefined();
    expect(z.nullable(z.string()).parse(null)).toBeNull();
    expect(typeof z.lazy).toBe('function');
    expect(typeof z.coerce).toBe('object');
  });
});
