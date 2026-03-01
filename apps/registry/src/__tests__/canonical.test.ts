import { describe, expect, test } from 'bun:test';
import { canonicalize } from '@brika/registry';

describe('canonicalize', () => {
  test('sorts object keys alphabetically', () => {
    expect(
      canonicalize({
        z: 1,
        a: 2,
        m: 3,
      })
    ).toBe('{"a":2,"m":3,"z":1}');
  });

  test('sorts nested object keys', () => {
    expect(
      canonicalize({
        b: {
          z: 1,
          a: 2,
        },
        a: 1,
      })
    ).toBe('{"a":1,"b":{"a":2,"z":1}}');
  });

  test('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  test('preserves null values', () => {
    expect(
      canonicalize({
        a: null,
        b: 1,
      })
    ).toBe('{"a":null,"b":1}');
  });

  test('strips undefined values', () => {
    expect(
      canonicalize({
        a: undefined,
        b: 1,
      })
    ).toBe('{"b":1}');
  });

  test('produces compact form (no whitespace)', () => {
    const result = canonicalize({
      key: 'value',
      arr: [1, 2],
    });
    expect(result).not.toContain(' ');
    expect(result).not.toContain('\n');
    expect(result).not.toContain('\t');
  });

  test('is idempotent', () => {
    const input = {
      z: [
        {
          b: 2,
          a: 1,
        },
      ],
      a: 'hello',
    };
    const first = canonicalize(input);
    const second = canonicalize(JSON.parse(first));
    expect(second).toBe(first);
  });

  test('handles deeply nested objects', () => {
    const input = {
      c: {
        b: {
          a: {
            z: 1,
            y: 2,
          },
        },
      },
    };
    expect(canonicalize(input)).toBe('{"c":{"b":{"a":{"y":2,"z":1}}}}');
  });

  test('handles empty objects and arrays', () => {
    expect(canonicalize({})).toBe('{}');
    expect(canonicalize([])).toBe('[]');
    expect(
      canonicalize({
        a: {},
        b: [],
      })
    ).toBe('{"a":{},"b":[]}');
  });

  test('handles strings, numbers, booleans', () => {
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
  });

  test('handles arrays of objects with sorted keys', () => {
    const input = [
      {
        z: 1,
        a: 2,
      },
      {
        b: 3,
        a: 4,
      },
    ];
    expect(canonicalize(input)).toBe('[{"a":2,"z":1},{"a":4,"b":3}]');
  });
});
