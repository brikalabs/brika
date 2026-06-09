import { describe, expect, it } from 'bun:test';
import { T } from './descriptor';
import { displayType } from './display';

describe('displayType', () => {
  describe('primitives', () => {
    it('displays string', () => {
      expect(displayType(T.string)).toBe('string');
    });

    it('displays number', () => {
      expect(displayType(T.number)).toBe('number');
    });

    it('displays boolean', () => {
      expect(displayType(T.boolean)).toBe('boolean');
    });

    it('displays null', () => {
      expect(displayType(T.null)).toBe('null');
    });
  });

  describe('literal', () => {
    it('wraps string literals in quotes', () => {
      expect(displayType(T.literal('hello'))).toBe('"hello"');
    });

    it('displays number literals without quotes', () => {
      expect(displayType(T.literal(42))).toBe('42');
    });

    it('displays boolean literals without quotes', () => {
      expect(displayType(T.literal(false))).toBe('false');
      expect(displayType(T.literal(true))).toBe('true');
    });
  });

  describe('object', () => {
    it('displays empty object as {}', () => {
      expect(displayType(T.obj({}))).toBe('{}');
    });

    it('displays object with required fields', () => {
      expect(displayType(T.obj({ name: T.string, age: T.number }))).toBe(
        '{name: string, age: number}'
      );
    });

    it('displays optional fields with ?', () => {
      const desc = T.object({
        name: { type: T.string, optional: false },
        nickname: { type: T.string, optional: true },
      });
      expect(displayType(desc)).toBe('{name: string, nickname?: string}');
    });

    it('displays nested object', () => {
      expect(displayType(T.obj({ user: T.obj({ id: T.number }) }))).toBe('{user: {id: number}}');
    });
  });

  describe('array', () => {
    it('displays simple array', () => {
      expect(displayType(T.array(T.string))).toBe('string[]');
    });

    it('displays nested array', () => {
      expect(displayType(T.array(T.array(T.number)))).toBe('number[][]');
    });

    it('wraps union element in parens', () => {
      expect(displayType(T.array(T.union([T.string, T.number])))).toBe('(string | number)[]');
    });

    it('does not wrap non-union elements in parens', () => {
      expect(displayType(T.array(T.string))).toBe('string[]');
    });
  });

  describe('tuple', () => {
    it('displays tuple with multiple elements', () => {
      expect(displayType(T.tuple([T.string, T.number, T.boolean]))).toBe(
        '[string, number, boolean]'
      );
    });

    it('displays empty tuple', () => {
      expect(displayType(T.tuple([]))).toBe('[]');
    });
  });

  describe('union', () => {
    it('displays union with pipe separator', () => {
      expect(displayType(T.union([T.string, T.number]))).toBe('string | number');
    });

    it('displays single-variant union without pipe', () => {
      expect(displayType(T.union([T.boolean]))).toBe('boolean');
    });
  });

  describe('record', () => {
    it('displays record with value type', () => {
      expect(displayType(T.record(T.string))).toBe('Record<string, string>');
    });

    it('displays record with unknown value', () => {
      expect(displayType(T.record(T.unknown))).toBe('Record<string, unknown>');
    });
  });

  describe('enum', () => {
    it('displays string enum values quoted', () => {
      expect(displayType(T.enum(['a', 'b']))).toBe('"a" | "b"');
    });

    it('displays number enum values unquoted', () => {
      expect(displayType(T.enum([1, 2, 3]))).toBe('1 | 2 | 3');
    });

    it('displays mixed enum correctly', () => {
      expect(displayType(T.enum(['x', 1]))).toBe('"x" | 1');
    });
  });

  describe('special kinds', () => {
    it('displays any', () => {
      expect(displayType(T.any)).toBe('any');
    });

    it('displays unknown', () => {
      expect(displayType(T.unknown)).toBe('unknown');
    });

    it('displays generic with default typeVar', () => {
      expect(displayType(T.generic())).toBe('generic<T>');
    });

    it('displays generic with custom typeVar', () => {
      expect(displayType(T.generic('K'))).toBe('generic<K>');
    });

    it('displays passthrough with sourcePortId', () => {
      expect(displayType(T.passthrough('in'))).toBe('passthrough(in)');
    });

    it('displays resolved with source and configField', () => {
      expect(displayType(T.resolved('mySource', 'myField'))).toBe('$resolve:mySource:myField');
    });
  });
});
