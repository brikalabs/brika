import { describe, expect, test } from 'bun:test';
import { compose, EMPTY_SPRITE, parseSprite, tint, translate } from './sprite';

describe('parseSprite', () => {
  test('dedents to the smallest common indent and trims blank top/bottom lines', () => {
    const s = parseSprite(`
      .--.
      |xx|
      '--'
    `);
    expect(s.height).toBe(3);
    expect(s.width).toBe(4);
    expect(s.rows[0]?.[0]?.ch).toBe('.');
    expect(s.rows[1]?.[1]?.ch).toBe('x');
  });

  test('treats the transparent char as null cells', () => {
    const s = parseSprite('·X·');
    expect(s.width).toBe(3);
    expect(s.rows[0]?.[0]).toBeNull();
    expect(s.rows[0]?.[1]?.ch).toBe('X');
    expect(s.rows[0]?.[2]).toBeNull();
  });

  test('honors a custom transparent char', () => {
    const s = parseSprite('.X.', { transparent: '.' });
    expect(s.rows[0]?.[0]).toBeNull();
    expect(s.rows[0]?.[1]?.ch).toBe('X');
  });

  test('pads short rows to the widest row', () => {
    const s = parseSprite('AB\nA');
    expect(s.width).toBe(2);
    expect(s.rows[1]?.[1]).toBeNull();
  });

  test('attaches color/dim/bold to every opaque cell', () => {
    const s = parseSprite('AB', { color: 'red', bold: true });
    expect(s.rows[0]?.[0]?.color).toBe('red');
    expect(s.rows[0]?.[1]?.bold).toBe(true);
  });
});

describe('compose', () => {
  test('top layer overwrites opaque cells of lower layers', () => {
    const lo = parseSprite('AAA');
    const hi = parseSprite('·B·');
    const out = compose([lo, hi]);
    expect(out.rows[0]?.[0]?.ch).toBe('A');
    expect(out.rows[0]?.[1]?.ch).toBe('B');
    expect(out.rows[0]?.[2]?.ch).toBe('A');
  });

  test('transparent cells in the top layer let the lower show through', () => {
    const lo = parseSprite('XXX');
    const hi = parseSprite('···');
    const out = compose([lo, hi]);
    expect(out.rows[0]?.[1]?.ch).toBe('X');
  });

  test('respects (x, y) offsets', () => {
    const base = parseSprite('···\n···\n···');
    const dot = parseSprite('!');
    const out = compose([base, { sprite: dot, x: 2, y: 1 }]);
    expect(out.rows[1]?.[2]?.ch).toBe('!');
    expect(out.rows[0]?.[0]).toBeNull();
  });

  test('grows the canvas to fit unsized layers', () => {
    const a = parseSprite('AA');
    const b = parseSprite('B');
    const out = compose([a, { sprite: b, x: 5, y: 3 }]);
    expect(out.width).toBe(6);
    expect(out.height).toBe(4);
  });

  test('clips cells outside an explicit canvas', () => {
    const dot = parseSprite('X');
    const out = compose([{ sprite: dot, x: 10, y: 10 }], { width: 5, height: 5 });
    expect(out.width).toBe(5);
    expect(out.rows.every((row) => row.every((c) => c === null))).toBe(true);
  });

  test('color overrides apply to opaque cells only', () => {
    const s = parseSprite('A·B');
    const out = compose([{ sprite: s, color: 'red' }]);
    expect(out.rows[0]?.[0]?.color).toBe('red');
    expect(out.rows[0]?.[1]).toBeNull();
    expect(out.rows[0]?.[2]?.color).toBe('red');
  });
});

describe('translate / tint / EMPTY_SPRITE', () => {
  test('translate produces a placement with the requested offset', () => {
    const s = parseSprite('X');
    const placement = translate(s, 4, 2);
    expect(placement.x).toBe(4);
    expect(placement.y).toBe(2);
    expect(placement.sprite).toBe(s);
  });

  test('tint recolors every opaque cell', () => {
    const out = tint(parseSprite('A·B'), 'green');
    expect(out.rows[0]?.[0]?.color).toBe('green');
    expect(out.rows[0]?.[1]).toBeNull();
    expect(out.rows[0]?.[2]?.color).toBe('green');
  });

  test('EMPTY_SPRITE has zero size', () => {
    expect(EMPTY_SPRITE.width).toBe(0);
    expect(EMPTY_SPRITE.height).toBe(0);
  });
});
