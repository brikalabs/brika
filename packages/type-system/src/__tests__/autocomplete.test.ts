import { describe, expect, it } from 'bun:test';
import { getCompletions } from '../autocomplete';
import { T } from '../descriptor';

describe('getCompletions', () => {
  it('returns root item for primitive', () => {
    const items = getCompletions(T.string, 'inputs.in');
    expect(items).toEqual([{ label: 'in', type: 'string', path: 'inputs.in', hasChildren: false }]);
  });

  it('returns fields for object type', () => {
    const items = getCompletions(T.obj({ name: T.string, age: T.number }), 'inputs.in');

    expect(items).toEqual([
      { label: 'in', type: '{name: string, age: number}', path: 'inputs.in', hasChildren: true },
      { label: 'name', type: 'string', path: 'inputs.in.name', hasChildren: false },
      { label: 'age', type: 'number', path: 'inputs.in.age', hasChildren: false },
    ]);
  });

  it('recurses into nested objects', () => {
    const items = getCompletions(T.obj({ user: T.obj({ name: T.string }) }), 'inputs.in');

    expect(items).toContainEqual({
      label: 'user',
      type: '{name: string}',
      path: 'inputs.in.user',
      hasChildren: true,
    });
    expect(items).toContainEqual({
      label: 'name',
      type: 'string',
      path: 'inputs.in.user.name',
      hasChildren: false,
    });
  });

  it('respects maxDepth', () => {
    const items = getCompletions(
      T.obj({ a: T.obj({ b: T.obj({ c: T.string }) }) }),
      'data',
      1 // only 1 level deep
    );

    const paths = items.map((i) => i.path);
    expect(paths).toContain('data');
    expect(paths).toContain('data.a');
    expect(paths).not.toContain('data.a.b');
  });

  it('handles array element access', () => {
    const items = getCompletions(T.array(T.obj({ id: T.string })), 'inputs.list');

    expect(items).toContainEqual({
      label: '[n]',
      type: '{id: string}',
      path: 'inputs.list[n]',
      hasChildren: true,
    });
    expect(items).toContainEqual({
      label: 'id',
      type: 'string',
      path: 'inputs.list[n].id',
      hasChildren: false,
    });
  });

  it('handles record type access', () => {
    const items = getCompletions(T.record(T.number), 'inputs.data');

    expect(items).toContainEqual({
      label: '[key]',
      type: 'number',
      path: 'inputs.data[key]',
      hasChildren: false,
    });
  });

  it('handles union of objects (common fields)', () => {
    const items = getCompletions(
      T.union([T.obj({ id: T.string, name: T.string }), T.obj({ id: T.string, age: T.number })]),
      'inputs.in'
    );

    // 'id' is common to both variants
    expect(items).toContainEqual({
      label: 'id',
      type: 'string',
      path: 'inputs.in.id',
      hasChildren: false,
    });

    // 'name' and 'age' are NOT common — should not appear
    const paths = items.map((i) => i.path);
    expect(paths).not.toContain('inputs.in.name');
    expect(paths).not.toContain('inputs.in.age');
  });

  it('returns only root for unknown type', () => {
    const items = getCompletions(T.unknown, 'data');
    expect(items).toEqual([{ label: 'data', type: 'unknown', path: 'data', hasChildren: false }]);
  });

  it('returns only root for generic type', () => {
    const items = getCompletions(T.generic(), 'data');
    expect(items).toEqual([
      { label: 'data', type: 'generic<T>', path: 'data', hasChildren: false },
    ]);
  });
});
