import { describe, expect, test } from 'bun:test';
import { extractQualifiedKey, takeBuildTimeCallSite } from './call-site';

describe('takeBuildTimeCallSite — no options', () => {
  test('returns null site when args is empty', () => {
    const result = takeBuildTimeCallSite([]);
    expect(result.site).toBeNull();
    expect(result.args).toEqual([]);
  });

  test('returns null site when only a key is given', () => {
    const result = takeBuildTimeCallSite(['common:hello']);
    expect(result.site).toBeNull();
    expect(result.args).toEqual(['common:hello']);
  });

  test('returns null site when second arg is null', () => {
    const result = takeBuildTimeCallSite(['common:hello', null]);
    expect(result.site).toBeNull();
    expect(result.args).toEqual(['common:hello', null]);
  });

  test('returns null site when second arg is a primitive', () => {
    const result = takeBuildTimeCallSite(['common:hello', 'not-an-options-object']);
    expect(result.site).toBeNull();
  });
});

describe('takeBuildTimeCallSite — with __cs', () => {
  test('parses file:line and strips __cs from args', () => {
    const result = takeBuildTimeCallSite([
      'common:hello',
      { __cs: 'src/App.tsx:42', count: 3 },
    ]);
    expect(result.site).toEqual({ file: 'src/App.tsx', line: 42 });
    expect(result.args[0]).toBe('common:hello');
    expect(result.args[1]).toEqual({ count: 3 });
  });

  test('handles a windows-style absolute path with a drive colon', () => {
    const result = takeBuildTimeCallSite([
      'k',
      { __cs: 'C:/repo/src/App.tsx:42' },
    ]);
    // lastIndexOf(':') is used so the drive colon is preserved in `file`
    expect(result.site).toEqual({ file: 'C:/repo/src/App.tsx', line: 42 });
  });

  test('defaults line to 0 when there is no colon', () => {
    const result = takeBuildTimeCallSite(['k', { __cs: 'src/App.tsx' }]);
    expect(result.site).toEqual({ file: 'src/App.tsx', line: 0 });
  });

  test('defaults line to 0 when line is not a number', () => {
    const result = takeBuildTimeCallSite(['k', { __cs: 'src/App.tsx:abc' }]);
    expect(result.site).toEqual({ file: 'src/App.tsx', line: 0 });
  });

  test('returns null site when __cs is absent on the options bag', () => {
    const result = takeBuildTimeCallSite(['k', { count: 1 }]);
    expect(result.site).toBeNull();
    expect(result.args[1]).toEqual({ count: 1 });
  });

  test('returns null site when __cs is not a string', () => {
    const result = takeBuildTimeCallSite(['k', { __cs: 123 }]);
    expect(result.site).toBeNull();
  });

  test('preserves other args (after the options bag)', () => {
    const result = takeBuildTimeCallSite([
      'k',
      { __cs: 'a:1', x: 'y' },
      'extra',
      42,
    ]);
    expect(result.site).toEqual({ file: 'a', line: 1 });
    expect(result.args).toEqual(['k', { x: 'y' }, 'extra', 42]);
  });

  test('does not mutate the original args', () => {
    const opts = { __cs: 'src/App.tsx:10', count: 3 };
    const args = ['k', opts];
    takeBuildTimeCallSite(args);
    expect(opts.__cs).toBe('src/App.tsx:10');
    expect(args[1]).toBe(opts);
  });
});

describe('extractQualifiedKey', () => {
  test('returns null when first arg is missing', () => {
    expect(extractQualifiedKey([])).toBeNull();
  });

  test('returns null when first arg is not a string', () => {
    expect(extractQualifiedKey([123])).toBeNull();
    expect(extractQualifiedKey([null])).toBeNull();
    expect(extractQualifiedKey([{ key: 'x' }])).toBeNull();
  });

  test('returns null when first arg is empty string', () => {
    expect(extractQualifiedKey([''])).toBeNull();
  });

  test('returns key as-is when already qualified', () => {
    expect(extractQualifiedKey(['common:hello'])).toBe('common:hello');
  });

  test('keeps existing ns:key form even when options provide a different ns', () => {
    expect(extractQualifiedKey(['common:hello', { ns: 'auth' }])).toBe('common:hello');
  });

  test('returns bare key when no options bag is present', () => {
    expect(extractQualifiedKey(['hello'])).toBe('hello');
  });

  test('returns bare key when options bag is not an object', () => {
    expect(extractQualifiedKey(['hello', 'not-an-options-object'])).toBe('hello');
    expect(extractQualifiedKey(['hello', null])).toBe('hello');
  });

  test('qualifies bare key with ns from string option', () => {
    expect(extractQualifiedKey(['hello', { ns: 'auth' }])).toBe('auth:hello');
  });

  test('qualifies bare key with first ns from array option', () => {
    expect(extractQualifiedKey(['hello', { ns: ['auth', 'common'] }])).toBe('auth:hello');
  });

  test('returns bare key when ns array is empty', () => {
    expect(extractQualifiedKey(['hello', { ns: [] }])).toBe('hello');
  });

  test('returns bare key when ns is absent on options', () => {
    expect(extractQualifiedKey(['hello', { count: 1 }])).toBe('hello');
  });

  test('returns bare key when ns is not a string or string[]', () => {
    expect(extractQualifiedKey(['hello', { ns: 123 }])).toBe('hello');
  });
});
