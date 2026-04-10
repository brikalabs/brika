import { describe, expect, it } from 'bun:test';
import { T } from '../descriptor';
import { isCompatible } from '../compatibility';

describe('isCompatible', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Wildcards
  // ─────────────────────────────────────────────────────────────────────────

  describe('wildcards', () => {
    it('any input accepts anything', () => {
      expect(isCompatible(T.string, T.any)).toBe(true);
      expect(isCompatible(T.number, T.any)).toBe(true);
      expect(isCompatible(T.obj({ x: T.number }), T.any)).toBe(true);
    });

    it('unknown input accepts anything', () => {
      expect(isCompatible(T.string, T.unknown)).toBe(true);
      expect(isCompatible(T.number, T.unknown)).toBe(true);
    });

    it('any output is accepted by anything', () => {
      expect(isCompatible(T.any, T.string)).toBe(true);
      expect(isCompatible(T.any, T.number)).toBe(true);
    });

    it('unknown output is accepted by anything', () => {
      expect(isCompatible(T.unknown, T.string)).toBe(true);
      expect(isCompatible(T.unknown, T.number)).toBe(true);
    });

    it('generic input accepts anything', () => {
      expect(isCompatible(T.string, T.generic())).toBe(true);
      expect(isCompatible(T.number, T.generic('T'))).toBe(true);
    });

    it('generic output is accepted by anything', () => {
      expect(isCompatible(T.generic(), T.string)).toBe(true);
      expect(isCompatible(T.generic('T'), T.number)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Primitives
  // ─────────────────────────────────────────────────────────────────────────

  describe('primitives', () => {
    it('same primitive types are compatible', () => {
      expect(isCompatible(T.string, T.string)).toBe(true);
      expect(isCompatible(T.number, T.number)).toBe(true);
      expect(isCompatible(T.boolean, T.boolean)).toBe(true);
      expect(isCompatible(T.null, T.null)).toBe(true);
    });

    it('different primitive types are incompatible', () => {
      expect(isCompatible(T.string, T.number)).toBe(false);
      expect(isCompatible(T.boolean, T.number)).toBe(false);
      expect(isCompatible(T.string, T.boolean)).toBe(false);
    });

    it('number widens to string', () => {
      expect(isCompatible(T.number, T.string)).toBe(true);
    });

    it('boolean widens to string', () => {
      expect(isCompatible(T.boolean, T.string)).toBe(true);
    });

    it('string does NOT widen to number', () => {
      expect(isCompatible(T.string, T.number)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Literals
  // ─────────────────────────────────────────────────────────────────────────

  describe('literals', () => {
    it('same literal values match', () => {
      expect(isCompatible(T.literal('hello'), T.literal('hello'))).toBe(true);
      expect(isCompatible(T.literal(42), T.literal(42))).toBe(true);
      expect(isCompatible(T.literal(true), T.literal(true))).toBe(true);
    });

    it('different literal values do not match', () => {
      expect(isCompatible(T.literal('hello'), T.literal('world'))).toBe(false);
      expect(isCompatible(T.literal(1), T.literal(2))).toBe(false);
    });

    it('literal widens to matching primitive', () => {
      expect(isCompatible(T.literal('hello'), T.string)).toBe(true);
      expect(isCompatible(T.literal(42), T.number)).toBe(true);
      expect(isCompatible(T.literal(true), T.boolean)).toBe(true);
    });

    it('any literal widens to string', () => {
      expect(isCompatible(T.literal(42), T.string)).toBe(true);
      expect(isCompatible(T.literal(true), T.string)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Objects (structural subtyping)
  // ─────────────────────────────────────────────────────────────────────────

  describe('objects', () => {
    it('same shape is compatible', () => {
      expect(isCompatible(T.obj({ name: T.string }), T.obj({ name: T.string }))).toBe(true);
    });

    it('output with extra fields satisfies input', () => {
      expect(
        isCompatible(T.obj({ name: T.string, age: T.number }), T.obj({ name: T.string }))
      ).toBe(true);
    });

    it('output missing required field is incompatible', () => {
      expect(
        isCompatible(T.obj({ name: T.string }), T.obj({ name: T.string, age: T.number }))
      ).toBe(false);
    });

    it('output missing optional field is compatible', () => {
      const input: Parameters<typeof isCompatible>[1] = {
        kind: 'object',
        fields: {
          name: { type: T.string, optional: false },
          age: { type: T.number, optional: true },
        },
      };
      expect(isCompatible(T.obj({ name: T.string }), input)).toBe(true);
    });

    it('field type mismatch is incompatible', () => {
      expect(isCompatible(T.obj({ name: T.boolean }), T.obj({ name: T.number }))).toBe(false);
    });

    it('field type widening works (number → string)', () => {
      expect(isCompatible(T.obj({ name: T.number }), T.obj({ name: T.string }))).toBe(true);
    });

    it('nested objects are checked structurally', () => {
      const output = T.obj({ user: T.obj({ name: T.string }) });
      const input = T.obj({ user: T.obj({ name: T.string }) });
      expect(isCompatible(output, input)).toBe(true);
    });

    it('empty objects are compatible', () => {
      expect(isCompatible(T.obj({}), T.obj({}))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Arrays
  // ─────────────────────────────────────────────────────────────────────────

  describe('arrays', () => {
    it('same element types are compatible', () => {
      expect(isCompatible(T.array(T.string), T.array(T.string))).toBe(true);
      expect(isCompatible(T.array(T.number), T.array(T.number))).toBe(true);
    });

    it('different element types are incompatible', () => {
      expect(isCompatible(T.array(T.string), T.array(T.number))).toBe(false);
    });

    it('element type widening works', () => {
      expect(isCompatible(T.array(T.number), T.array(T.string))).toBe(true);
    });

    it('array is not compatible with non-array', () => {
      expect(isCompatible(T.array(T.string), T.string)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tuples
  // ─────────────────────────────────────────────────────────────────────────

  describe('tuples', () => {
    it('same tuple is compatible', () => {
      expect(isCompatible(T.tuple([T.string, T.number]), T.tuple([T.string, T.number]))).toBe(
        true
      );
    });

    it('different length tuples are incompatible', () => {
      expect(isCompatible(T.tuple([T.string]), T.tuple([T.string, T.number]))).toBe(false);
    });

    it('element type mismatch is incompatible', () => {
      expect(isCompatible(T.tuple([T.string, T.string]), T.tuple([T.string, T.number]))).toBe(
        false
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Unions
  // ─────────────────────────────────────────────────────────────────────────

  describe('unions', () => {
    it('output union: all variants must satisfy input', () => {
      // string | number → string (number widens to string)
      expect(isCompatible(T.union([T.string, T.number]), T.string)).toBe(true);

      // string | object → string (object does NOT widen to string)
      expect(
        isCompatible(T.union([T.string, T.obj({ x: T.number })]), T.string)
      ).toBe(false);
    });

    it('input union: output must satisfy at least one variant', () => {
      // number → string | number
      expect(isCompatible(T.number, T.union([T.string, T.number]))).toBe(true);

      // boolean → string | number (boolean widens to string, which is a variant)
      expect(isCompatible(T.boolean, T.union([T.string, T.number]))).toBe(true);
    });

    it('union to union: all output variants satisfy at least one input variant', () => {
      expect(
        isCompatible(T.union([T.string, T.number]), T.union([T.string, T.number]))
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Records
  // ─────────────────────────────────────────────────────────────────────────

  describe('records', () => {
    it('same value types are compatible', () => {
      expect(isCompatible(T.record(T.string), T.record(T.string))).toBe(true);
    });

    it('different value types are incompatible', () => {
      expect(isCompatible(T.record(T.string), T.record(T.number))).toBe(false);
    });

    it('record can satisfy object if value type is compatible', () => {
      expect(isCompatible(T.record(T.string), T.obj({ name: T.string }))).toBe(true);
    });

    it('record cannot satisfy object if value type is incompatible', () => {
      // number → string widens, so use a truly incompatible type
      expect(isCompatible(T.record(T.boolean), T.obj({ name: T.number }))).toBe(false);
    });

    it('object can satisfy record if all field types are compatible', () => {
      expect(isCompatible(T.obj({ a: T.string, b: T.string }), T.record(T.string))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Enums
  // ─────────────────────────────────────────────────────────────────────────

  describe('enums', () => {
    it('same enum values are compatible', () => {
      expect(isCompatible(T.enum(['a', 'b']), T.enum(['a', 'b']))).toBe(true);
    });

    it('subset enum satisfies superset', () => {
      expect(isCompatible(T.enum(['a']), T.enum(['a', 'b']))).toBe(true);
    });

    it('superset enum does NOT satisfy subset', () => {
      expect(isCompatible(T.enum(['a', 'b', 'c']), T.enum(['a', 'b']))).toBe(false);
    });

    it('string enum widens to string primitive', () => {
      expect(isCompatible(T.enum(['a', 'b']), T.string)).toBe(true);
    });

    it('number enum widens to number primitive', () => {
      expect(isCompatible(T.enum([1, 2, 3]), T.number)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Passthrough & Resolved (unresolved markers)
  // ─────────────────────────────────────────────────────────────────────────

  describe('unresolved markers', () => {
    it('passthrough input accepts anything', () => {
      expect(isCompatible(T.string, T.passthrough('in'))).toBe(true);
    });

    it('passthrough output is accepted by anything', () => {
      expect(isCompatible(T.passthrough('in'), T.string)).toBe(true);
    });

    it('resolved input accepts anything', () => {
      expect(isCompatible(T.string, T.resolved('spark', 'sparkType'))).toBe(true);
    });

    it('resolved output is accepted by anything', () => {
      expect(isCompatible(T.resolved('spark', 'sparkType'), T.string)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cross-kind compatibility (edge cases from existing tests)
  // ─────────────────────────────────────────────────────────────────────────

  describe('cross-kind', () => {
    it('object is not compatible with string', () => {
      expect(isCompatible(T.obj({ x: T.number }), T.string)).toBe(false);
    });

    it('string is not compatible with object', () => {
      expect(isCompatible(T.string, T.obj({ x: T.number }))).toBe(false);
    });

    it('array is not compatible with object', () => {
      expect(isCompatible(T.array(T.string), T.obj({}))).toBe(false);
    });
  });
});
