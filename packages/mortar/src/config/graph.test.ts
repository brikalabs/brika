import { describe, expect, test } from 'bun:test';
import { topologicalLayers } from './graph';
import type { ServiceSpec } from './types';

function svc(id: string, dependsOn: string[] = []): ServiceSpec {
  return {
    id,
    label: id.toUpperCase(),
    command: `echo ${id}`,
    env: {},
    dependsOn,
    cwd: null,
    port: null,
    health: { kind: 'none' },
    url: null,
  };
}

describe('topologicalLayers', () => {
  test('single service → one layer', () => {
    const layers = topologicalLayers([svc('a')]);
    expect(layers.map((l) => l.map((s) => s.id))).toEqual([['a']]);
  });

  test('two independent services → one layer of two', () => {
    const layers = topologicalLayers([svc('a'), svc('b')]);
    expect(layers.map((l) => l.map((s) => s.id))).toEqual([['a', 'b']]);
  });

  test('linear chain produces N layers', () => {
    const layers = topologicalLayers([svc('a'), svc('b', ['a']), svc('c', ['b'])]);
    expect(layers.map((l) => l.map((s) => s.id))).toEqual([['a'], ['b'], ['c']]);
  });

  test('diamond: A → B, C → D', () => {
    const layers = topologicalLayers([
      svc('a'),
      svc('b', ['a']),
      svc('c', ['a']),
      svc('d', ['b', 'c']),
    ]);
    expect(layers.map((l) => l.map((s) => s.id))).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  test('preserves input order within a layer', () => {
    const layers = topologicalLayers([svc('z'), svc('y'), svc('x')]);
    expect(layers[0]?.map((s) => s.id)).toEqual(['z', 'y', 'x']);
  });

  test('service whose deps span multiple layers lands in deepest+1', () => {
    // a → b → d
    // a → c → d
    const layers = topologicalLayers([
      svc('a'),
      svc('b', ['a']),
      svc('c', ['b']),
      svc('d', ['a', 'c']),
    ]);
    // a:0, b:1, c:2, d:max(0,2)+1=3
    expect(layers.map((l) => l.map((s) => s.id))).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  test('empty input → empty layers', () => {
    expect(topologicalLayers([])).toEqual([]);
  });

  test("missing dep id (treated as no-dep) doesn't crash", () => {
    // Validation rules out unknown deps in practice; this only
    // exercises the defensive `if (!svc) return 0` path in compute().
    // The ghost dep claims depth 0 → service `b` lands at depth 1,
    // so we get an empty layer-0 plus a layer-1 with `b`.
    const layers = topologicalLayers([svc('b', ['ghost'])]);
    expect(layers.length).toBe(2);
    expect(layers[1]?.map((s) => s.id)).toEqual(['b']);
  });
});
