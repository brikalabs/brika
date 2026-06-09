import { describe, expect, it } from 'bun:test';
import {
  inferType,
  isConcrete,
  isWildcard,
  needsResolution,
  parsePortType,
  parseTypeName,
  T,
} from './descriptor';

// ─────────────────────────────────────────────────────────────────────────────
// T constructors
// ─────────────────────────────────────────────────────────────────────────────

describe('T constructors', () => {
  it('T.string is a string primitive', () => {
    expect(T.string).toEqual({ kind: 'primitive', type: 'string' });
  });

  it('T.number is a number primitive', () => {
    expect(T.number).toEqual({ kind: 'primitive', type: 'number' });
  });

  it('T.boolean is a boolean primitive', () => {
    expect(T.boolean).toEqual({ kind: 'primitive', type: 'boolean' });
  });

  it('T.null is a null primitive', () => {
    expect(T.null).toEqual({ kind: 'primitive', type: 'null' });
  });

  it('T.any produces any kind', () => {
    expect(T.any).toEqual({ kind: 'any' });
  });

  it('T.unknown produces unknown kind', () => {
    expect(T.unknown).toEqual({ kind: 'unknown' });
  });

  it('T.literal creates literal descriptor', () => {
    expect(T.literal('hi')).toEqual({ kind: 'literal', value: 'hi' });
    expect(T.literal(0)).toEqual({ kind: 'literal', value: 0 });
    expect(T.literal(false)).toEqual({ kind: 'literal', value: false });
  });

  it('T.object creates object with provided fields', () => {
    const fields = { x: { type: T.string, optional: false } };
    expect(T.object(fields)).toEqual({ kind: 'object', fields });
  });

  it('T.obj creates object with all required fields', () => {
    const result = T.obj({ a: T.number, b: T.boolean });
    expect(result).toEqual({
      kind: 'object',
      fields: {
        a: { type: T.number, optional: false },
        b: { type: T.boolean, optional: false },
      },
    });
  });

  it('T.obj with empty fields', () => {
    expect(T.obj({})).toEqual({ kind: 'object', fields: {} });
  });

  it('T.array creates array descriptor', () => {
    expect(T.array(T.string)).toEqual({ kind: 'array', element: T.string });
  });

  it('T.tuple creates tuple descriptor', () => {
    expect(T.tuple([T.string, T.number])).toEqual({
      kind: 'tuple',
      elements: [T.string, T.number],
    });
  });

  it('T.union creates union descriptor', () => {
    expect(T.union([T.string, T.null])).toEqual({
      kind: 'union',
      variants: [T.string, T.null],
    });
  });

  it('T.record creates record descriptor', () => {
    expect(T.record(T.boolean)).toEqual({ kind: 'record', value: T.boolean });
  });

  it('T.enum creates enum descriptor', () => {
    expect(T.enum(['a', 'b'])).toEqual({ kind: 'enum', values: ['a', 'b'] });
  });

  it('T.generic defaults typeVar to T', () => {
    expect(T.generic()).toEqual({ kind: 'generic', typeVar: 'T' });
  });

  it('T.generic accepts custom typeVar', () => {
    expect(T.generic('K')).toEqual({ kind: 'generic', typeVar: 'K' });
  });

  it('T.passthrough creates passthrough descriptor', () => {
    expect(T.passthrough('in')).toEqual({ kind: 'passthrough', sourcePortId: 'in' });
  });

  it('T.resolved creates resolved descriptor', () => {
    expect(T.resolved('src', 'field')).toEqual({
      kind: 'resolved',
      source: 'src',
      configField: 'field',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

describe('isConcrete', () => {
  it('returns true for primitives', () => {
    expect(isConcrete(T.string)).toBe(true);
    expect(isConcrete(T.number)).toBe(true);
  });

  it('returns true for any/unknown/literal/object/array/tuple/union/record/enum', () => {
    expect(isConcrete(T.any)).toBe(true);
    expect(isConcrete(T.unknown)).toBe(true);
    expect(isConcrete(T.literal(1))).toBe(true);
    expect(isConcrete(T.obj({}))).toBe(true);
    expect(isConcrete(T.array(T.string))).toBe(true);
    expect(isConcrete(T.tuple([]))).toBe(true);
    expect(isConcrete(T.union([T.string]))).toBe(true);
    expect(isConcrete(T.record(T.string))).toBe(true);
    expect(isConcrete(T.enum(['a']))).toBe(true);
  });

  it('returns false for generic', () => {
    expect(isConcrete(T.generic())).toBe(false);
  });

  it('returns false for passthrough', () => {
    expect(isConcrete(T.passthrough('in'))).toBe(false);
  });

  it('returns false for resolved', () => {
    expect(isConcrete(T.resolved('a', 'b'))).toBe(false);
  });
});

describe('isWildcard', () => {
  it('returns true for any', () => {
    expect(isWildcard(T.any)).toBe(true);
  });

  it('returns true for unknown', () => {
    expect(isWildcard(T.unknown)).toBe(true);
  });

  it('returns true for generic', () => {
    expect(isWildcard(T.generic())).toBe(true);
  });

  it('returns false for primitive', () => {
    expect(isWildcard(T.string)).toBe(false);
    expect(isWildcard(T.number)).toBe(false);
  });

  it('returns false for passthrough', () => {
    expect(isWildcard(T.passthrough('in'))).toBe(false);
  });

  it('returns false for resolved', () => {
    expect(isWildcard(T.resolved('a', 'b'))).toBe(false);
  });
});

describe('needsResolution', () => {
  it('returns true for generic', () => {
    expect(needsResolution(T.generic())).toBe(true);
  });

  it('returns true for passthrough', () => {
    expect(needsResolution(T.passthrough('in'))).toBe(true);
  });

  it('returns true for resolved', () => {
    expect(needsResolution(T.resolved('a', 'b'))).toBe(true);
  });

  it('returns false for concrete types', () => {
    expect(needsResolution(T.string)).toBe(false);
    expect(needsResolution(T.any)).toBe(false);
    expect(needsResolution(T.unknown)).toBe(false);
    expect(needsResolution(T.obj({}))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseTypeName
// ─────────────────────────────────────────────────────────────────────────────

describe('parseTypeName', () => {
  it('returns generic T when called with no argument', () => {
    expect(parseTypeName()).toEqual({ kind: 'generic', typeVar: 'T' });
  });

  it('returns generic T when called with undefined', () => {
    expect(parseTypeName(undefined)).toEqual({ kind: 'generic', typeVar: 'T' });
  });

  it('returns generic T when called with empty string', () => {
    expect(parseTypeName('')).toEqual({ kind: 'generic', typeVar: 'T' });
  });

  it('parses simple type: string', () => {
    expect(parseTypeName('string')).toEqual(T.string);
  });

  it('parses simple type: number', () => {
    expect(parseTypeName('number')).toEqual(T.number);
  });

  it('parses integer as number', () => {
    expect(parseTypeName('integer')).toEqual(T.number);
  });

  it('parses simple type: boolean', () => {
    expect(parseTypeName('boolean')).toEqual(T.boolean);
  });

  it('parses simple type: null', () => {
    expect(parseTypeName('null')).toEqual(T.null);
  });

  it('parses "unknown" as unknown', () => {
    expect(parseTypeName('unknown')).toEqual(T.unknown);
  });

  it('parses "any" as unknown', () => {
    expect(parseTypeName('any')).toEqual(T.unknown);
  });

  it('parses "array" as array of unknown', () => {
    expect(parseTypeName('array')).toEqual(T.array(T.unknown));
  });

  it('parses array shorthand: string[]', () => {
    expect(parseTypeName('string[]')).toEqual(T.array(T.string));
  });

  it('parses nested array: number[][]', () => {
    expect(parseTypeName('number[][]')).toEqual(T.array(T.array(T.number)));
  });

  it('parses generic<T>', () => {
    expect(parseTypeName('generic<T>')).toEqual({ kind: 'generic', typeVar: 'T' });
  });

  it('parses generic<K>', () => {
    expect(parseTypeName('generic<K>')).toEqual({ kind: 'generic', typeVar: 'K' });
  });

  it('parses generic without angle brackets (defaults to T)', () => {
    expect(parseTypeName('generic')).toEqual({ kind: 'generic', typeVar: 'T' });
  });

  it('parses passthrough(in)', () => {
    expect(parseTypeName('passthrough(in)')).toEqual({ kind: 'passthrough', sourcePortId: 'in' });
  });

  it('parses passthrough(output)', () => {
    expect(parseTypeName('passthrough(output)')).toEqual({
      kind: 'passthrough',
      sourcePortId: 'output',
    });
  });

  it('parses passthrough without parens (defaults to in)', () => {
    expect(parseTypeName('passthrough')).toEqual({ kind: 'passthrough', sourcePortId: 'in' });
  });

  it('parses __passthrough:portId', () => {
    expect(parseTypeName('__passthrough:myPort')).toEqual({
      kind: 'passthrough',
      sourcePortId: 'myPort',
    });
  });

  it('parses $resolve:source:field', () => {
    expect(parseTypeName('$resolve:mySource:myField')).toEqual({
      kind: 'resolved',
      source: 'mySource',
      configField: 'myField',
    });
  });

  it('parses $resolve with empty parts', () => {
    expect(parseTypeName('$resolve::')).toEqual({
      kind: 'resolved',
      source: '',
      configField: '',
    });
  });

  it('returns unknown for unrecognized type name', () => {
    expect(parseTypeName('foobar')).toEqual(T.unknown);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parsePortType
// ─────────────────────────────────────────────────────────────────────────────

describe('parsePortType', () => {
  it('uses structured type.kind when present', () => {
    const port = { type: { kind: 'primitive', type: 'string' } };
    expect(parsePortType(port)).toEqual({ kind: 'primitive', type: 'string' });
  });

  it('falls back to typeName when type has no kind', () => {
    const port = { typeName: 'number' };
    expect(parsePortType(port)).toEqual(T.number);
  });

  it('falls back to typeName when type is undefined', () => {
    expect(parsePortType({ typeName: 'boolean' })).toEqual(T.boolean);
  });

  it('returns generic T when both type and typeName are absent', () => {
    expect(parsePortType({})).toEqual({ kind: 'generic', typeVar: 'T' });
  });

  it('uses structured type for generic kind', () => {
    const port = { type: { kind: 'generic', typeVar: 'K' }, typeName: 'string' };
    expect(parsePortType(port)).toEqual({ kind: 'generic', typeVar: 'K' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inferType
// ─────────────────────────────────────────────────────────────────────────────

describe('inferType', () => {
  it('infers null', () => {
    expect(inferType(null)).toEqual(T.null);
  });

  it('infers string', () => {
    expect(inferType('hello')).toEqual(T.string);
  });

  it('infers number', () => {
    expect(inferType(3.14)).toEqual(T.number);
  });

  it('infers boolean', () => {
    expect(inferType(true)).toEqual(T.boolean);
  });

  it('infers array', () => {
    expect(inferType([1, 2, 3])).toEqual(T.array(T.unknown));
  });

  it('infers object', () => {
    expect(inferType({ a: 1 })).toEqual(T.record(T.unknown));
  });

  it('infers unknown for symbol', () => {
    expect(inferType(Symbol('s'))).toEqual(T.unknown);
  });

  it('infers unknown for function', () => {
    expect(inferType(() => {})).toEqual(T.unknown);
  });
});
