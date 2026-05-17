import { describe, expect, test } from 'bun:test';
import { formatArgs, formatValue } from './format';

function namedFn(): number {
  return 1;
}

describe('formatValue — primitives', () => {
  test('null', () => {
    expect(formatValue(null)).toBe('null');
  });

  test('undefined', () => {
    expect(formatValue(undefined)).toBe('undefined');
  });

  test('string passes through unchanged when short', () => {
    expect(formatValue('hello')).toBe('hello');
  });

  test('empty string', () => {
    expect(formatValue('')).toBe('');
  });

  test('number', () => {
    expect(formatValue(42)).toBe('42');
    expect(formatValue(0)).toBe('0');
    expect(formatValue(-1.5)).toBe('-1.5');
    expect(formatValue(Number.NaN)).toBe('NaN');
    expect(formatValue(Number.POSITIVE_INFINITY)).toBe('Infinity');
  });

  test('boolean', () => {
    expect(formatValue(true)).toBe('true');
    expect(formatValue(false)).toBe('false');
  });

  test('bigint', () => {
    expect(formatValue(123n)).toBe('123');
  });

  test('symbol', () => {
    expect(formatValue(Symbol('s'))).toBe('Symbol(s)');
    expect(formatValue(Symbol())).toBe('Symbol()');
  });

  test('named function', () => {
    expect(formatValue(namedFn)).toBe('[Function: namedFn]');
  });

  test('anonymous function shows [Function] when name is empty', () => {
    const anon = (
      () => () =>
        undefined
    )();
    Object.defineProperty(anon, 'name', { value: '' });
    expect(formatValue(anon)).toBe('[Function]');
  });

  test('long string clipped with overflow suffix', () => {
    const s = 'a'.repeat(600);
    const out = formatValue(s);
    expect(out.startsWith('a'.repeat(500))).toBe(true);
    expect(out.endsWith('… (100 more chars)')).toBe(true);
  });

  test('string exactly at the clip boundary is not clipped', () => {
    const s = 'a'.repeat(500);
    expect(formatValue(s)).toBe(s);
  });
});

describe('formatValue — errors', () => {
  test('Error with stack returns the stack', () => {
    const err = new Error('boom');
    expect(formatValue(err)).toBe(err.stack ?? '');
  });

  test('Error without a stack falls back to name: message', () => {
    const err = new Error('boom');
    Object.defineProperty(err, 'stack', { value: undefined });
    expect(formatValue(err)).toBe('Error: boom');
  });

  test('custom error subclass', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const err = new CustomError('nope');
    Object.defineProperty(err, 'stack', { value: undefined });
    expect(formatValue(err)).toBe('CustomError: nope');
  });
});

describe('formatValue — arrays', () => {
  test('empty array', () => {
    expect(formatValue([])).toBe('[]');
  });

  test('array of primitives', () => {
    expect(formatValue([1, 'a', true])).toBe('[ 1, a, true ]');
  });

  test('array exceeding MAX_ARRAY_ITEMS shows truncation suffix', () => {
    const arr = Array.from({ length: 55 }, (_, i) => i);
    const out = formatValue(arr);
    expect(out.includes('… 5 more')).toBe(true);
    expect(out.startsWith('[ 0, 1, 2')).toBe(true);
  });

  test('array depth hits the MAX_DEPTH ceiling', () => {
    // depth 0 → array, depth 1 → array, … depth 4 → '[Array]'
    const deep: unknown = [[[[[[1]]]]]];
    const out = formatValue(deep);
    expect(out.includes('[Array]')).toBe(true);
  });
});

describe('formatValue — objects', () => {
  test('empty plain object renders as {}', () => {
    expect(formatValue({})).toBe('{}');
  });

  test('object of primitives', () => {
    expect(formatValue({ a: 1, b: 'x' })).toBe('{ a: 1, b: x }');
  });

  test('object exceeding MAX_OBJECT_KEYS shows truncation suffix', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 55; i++) {
      obj[`k${i}`] = i;
    }
    const out = formatValue(obj);
    expect(out.includes('… 5 more')).toBe(true);
  });

  test('non-plain empty object renders its tag', () => {
    // Map has no own enumerable string keys → entries empty → tag branch.
    expect(formatValue(new Map())).toBe('[Map]');
  });

  test('non-plain object with own enumerable entries renders normally', () => {
    const m = new Map();
    Object.defineProperty(m, 'extra', { value: 1, enumerable: true });
    const out = formatValue(m);
    expect(out.startsWith('{ extra:')).toBe(true);
  });

  test('object depth hits the MAX_DEPTH ceiling', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    expect(formatValue(deep).includes('[Object]')).toBe(true);
  });
});

describe('formatValue — circular references', () => {
  test('self-referencing object', () => {
    interface Node {
      self?: Node;
    }
    const n: Node = {};
    n.self = n;
    expect(formatValue(n)).toBe('{ self: [Circular] }');
  });

  test('self-referencing array', () => {
    const arr: unknown[] = [];
    arr.push(arr);
    expect(formatValue(arr)).toBe('[ [Circular] ]');
  });

  test('shared (non-circular) refs still trip the seen-set — known limitation', () => {
    // The seen-set is global to the traversal, so a node visited via one
    // path is reported [Circular] on a second path even when the graph is
    // a DAG. This test pins that behaviour so any future fix surfaces here.
    const shared = { x: 1 };
    const out = formatValue({ a: shared, b: shared });
    expect(out.includes('[Circular]')).toBe(true);
  });
});

describe('formatArgs', () => {
  test('empty arg list', () => {
    expect(formatArgs([])).toBe('');
  });

  test('joins multiple args with a space', () => {
    expect(formatArgs(['hello', 42, true])).toBe('hello 42 true');
  });

  test('mixes primitives and objects', () => {
    expect(formatArgs(['x', { a: 1 }])).toBe('x { a: 1 }');
  });
});
