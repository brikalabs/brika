import { describe, expect, it } from 'bun:test';
import { deleteNestedValue, resolvePath, setNestedValue } from './nested-path';

describe('setNestedValue', () => {
  it('sets a top-level key', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'greeting', 'hello');
    expect(obj).toEqual({ greeting: 'hello' });
  });

  it('sets a deeply nested key, creating intermediates', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c.d', 'deep');
    expect(obj).toEqual({ a: { b: { c: { d: 'deep' } } } });
  });

  it('overwrites an existing value', () => {
    const obj: Record<string, unknown> = { a: { b: 'old' } };
    setNestedValue(obj, 'a.b', 'new');
    expect(obj).toEqual({ a: { b: 'new' } });
  });

  it('is a no-op for an empty path string', () => {
    const obj: Record<string, unknown> = { x: 1 };
    setNestedValue(obj, '', 'nope');
    expect(obj).toEqual({ x: 1 });
  });

  it('replaces a non-object intermediate with an object', () => {
    const obj: Record<string, unknown> = { a: 'string-value' };
    setNestedValue(obj, 'a.b', 'nested');
    expect(obj).toEqual({ a: { b: 'nested' } });
  });
});

describe('deleteNestedValue', () => {
  it('deletes a top-level key', () => {
    const obj: Record<string, unknown> = { a: 1, b: 2 };
    deleteNestedValue(obj, 'a');
    expect(obj).toEqual({ b: 2 });
  });

  it('deletes a nested key', () => {
    const obj: Record<string, unknown> = { a: { b: 'value', c: 'keep' } };
    deleteNestedValue(obj, 'a.b');
    expect(obj).toEqual({ a: { c: 'keep' } });
  });

  it('is a no-op for a missing path', () => {
    const obj: Record<string, unknown> = { a: 1 };
    deleteNestedValue(obj, 'x.y.z');
    expect(obj).toEqual({ a: 1 });
  });

  it('is a no-op for an empty path', () => {
    const obj: Record<string, unknown> = { a: 1 };
    deleteNestedValue(obj, '');
    expect(obj).toEqual({ a: 1 });
  });
});

describe('resolvePath', () => {
  it('resolves a top-level key', () => {
    const obj: Record<string, unknown> = { greeting: 'hi' };
    const result = resolvePath(obj, 'greeting');
    expect(result).toEqual({ parent: obj, key: 'greeting' });
  });

  it('resolves a nested key', () => {
    const inner = { c: 'value' };
    const obj: Record<string, unknown> = { a: { b: inner } };
    const result = resolvePath(obj, 'a.b.c');
    expect(result).toEqual({ parent: inner, key: 'c' });
  });

  it('returns undefined for a missing intermediate', () => {
    const obj: Record<string, unknown> = { a: { b: 'leaf' } };
    const result = resolvePath(obj, 'x.y.z');
    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty path', () => {
    const obj: Record<string, unknown> = { a: 1 };
    const result = resolvePath(obj, '');
    expect(result).toBeUndefined();
  });

  it('returns undefined when an intermediate is not an object', () => {
    const obj: Record<string, unknown> = { a: 'string' };
    const result = resolvePath(obj, 'a.b.c');
    expect(result).toBeUndefined();
  });
});
