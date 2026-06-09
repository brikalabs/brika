import { describe, expect, it } from 'bun:test';
import { T } from './descriptor';
import { toJsonSchema } from './to-json-schema';

describe('toJsonSchema', () => {
  describe('primitives', () => {
    it('converts string', () => {
      expect(toJsonSchema(T.string)).toEqual({ type: 'string' });
    });

    it('converts number', () => {
      expect(toJsonSchema(T.number)).toEqual({ type: 'number' });
    });

    it('converts boolean', () => {
      expect(toJsonSchema(T.boolean)).toEqual({ type: 'boolean' });
    });

    it('converts null', () => {
      expect(toJsonSchema(T.null)).toEqual({ type: 'null' });
    });
  });

  describe('literal', () => {
    it('converts string literal', () => {
      expect(toJsonSchema(T.literal('hello'))).toEqual({ const: 'hello' });
    });

    it('converts number literal', () => {
      expect(toJsonSchema(T.literal(42))).toEqual({ const: 42 });
    });

    it('converts boolean literal', () => {
      expect(toJsonSchema(T.literal(true))).toEqual({ const: true });
    });
  });

  describe('object', () => {
    it('converts object with all required fields', () => {
      const result = toJsonSchema(T.obj({ name: T.string, age: T.number }));
      expect(result).toEqual({
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'number' } },
        required: ['name', 'age'],
      });
    });

    it('omits required array when all fields are optional', () => {
      const desc = T.object({
        name: { type: T.string, optional: true },
        age: { type: T.number, optional: true },
      });
      const result = toJsonSchema(desc);
      expect(result).toEqual({
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'number' } },
      });
      expect(result.required).toBeUndefined();
    });

    it('includes required for non-optional fields only', () => {
      const desc = T.object({
        name: { type: T.string, optional: false },
        age: { type: T.number, optional: true },
      });
      const result = toJsonSchema(desc);
      expect(result.required as string[]).toEqual(['name']);
    });

    it('converts empty object', () => {
      const result = toJsonSchema(T.obj({}));
      expect(result).toEqual({ type: 'object', properties: {} });
    });
  });

  describe('array', () => {
    it('converts array with element type', () => {
      expect(toJsonSchema(T.array(T.string))).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    });

    it('converts nested array', () => {
      expect(toJsonSchema(T.array(T.array(T.number)))).toEqual({
        type: 'array',
        items: { type: 'array', items: { type: 'number' } },
      });
    });
  });

  describe('tuple', () => {
    it('converts tuple to prefixItems', () => {
      expect(toJsonSchema(T.tuple([T.string, T.number, T.boolean]))).toEqual({
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      });
    });

    it('converts empty tuple', () => {
      expect(toJsonSchema(T.tuple([]))).toEqual({ type: 'array', prefixItems: [] });
    });
  });

  describe('union', () => {
    it('converts union to anyOf', () => {
      expect(toJsonSchema(T.union([T.string, T.number]))).toEqual({
        anyOf: [{ type: 'string' }, { type: 'number' }],
      });
    });

    it('handles single-variant union', () => {
      expect(toJsonSchema(T.union([T.boolean]))).toEqual({
        anyOf: [{ type: 'boolean' }],
      });
    });
  });

  describe('record', () => {
    it('converts record to additionalProperties', () => {
      expect(toJsonSchema(T.record(T.string))).toEqual({
        type: 'object',
        additionalProperties: { type: 'string' },
      });
    });

    it('converts record with unknown value', () => {
      expect(toJsonSchema(T.record(T.unknown))).toEqual({
        type: 'object',
        additionalProperties: {},
      });
    });
  });

  describe('enum', () => {
    it('converts string enum', () => {
      expect(toJsonSchema(T.enum(['a', 'b', 'c']))).toEqual({ enum: ['a', 'b', 'c'] });
    });

    it('converts number enum', () => {
      expect(toJsonSchema(T.enum([1, 2, 3]))).toEqual({ enum: [1, 2, 3] });
    });

    it('converts mixed enum', () => {
      expect(toJsonSchema(T.enum(['x', 1]))).toEqual({ enum: ['x', 1] });
    });
  });

  describe('any / unknown', () => {
    it('converts any to empty schema', () => {
      expect(toJsonSchema(T.any)).toEqual({});
    });

    it('converts unknown to empty schema', () => {
      expect(toJsonSchema(T.unknown)).toEqual({});
    });
  });

  describe('special kinds', () => {
    it('converts generic with description', () => {
      expect(toJsonSchema(T.generic('T'))).toEqual({ description: 'generic<T>' });
    });

    it('converts generic with custom typeVar', () => {
      expect(toJsonSchema(T.generic('K'))).toEqual({ description: 'generic<K>' });
    });

    it('converts passthrough with sourcePortId', () => {
      expect(toJsonSchema(T.passthrough('in'))).toEqual({ description: 'passthrough(in)' });
    });

    it('converts resolved with source and configField', () => {
      expect(toJsonSchema(T.resolved('mySource', 'myField'))).toEqual({
        description: '$resolve:mySource:myField',
      });
    });
  });
});
