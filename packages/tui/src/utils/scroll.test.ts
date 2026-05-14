import { describe, expect, test } from 'bun:test';
import { clampScroll, effectiveScrollOffset, scrollDownBy } from './scroll';

describe('clampScroll', () => {
  test.each([
    [-5, 100, 0],
    [0, 100, 0],
    [50, 100, 50],
    [100, 100, 100],
    [150, 100, 100],
  ])('clampScroll(%i, %i) → %i', (value, max, expected) => {
    expect(clampScroll(value, max)).toBe(expected);
  });

  test('zero max means everything clamps to 0', () => {
    expect(clampScroll(10, 0)).toBe(0);
    expect(clampScroll(0, 0)).toBe(0);
  });
});

describe('scrollDownBy', () => {
  test('returns null when current is already null (live-tail)', () => {
    expect(scrollDownBy(null, 1)).toBeNull();
    expect(scrollDownBy(null, 100)).toBeNull();
  });

  test('subtracts and stays above zero', () => {
    expect(scrollDownBy(50, 10)).toBe(40);
    expect(scrollDownBy(10, 1)).toBe(9);
  });

  test('crossing zero returns null (snap to live)', () => {
    expect(scrollDownBy(5, 5)).toBeNull();
    expect(scrollDownBy(5, 100)).toBeNull();
  });
});

describe('effectiveScrollOffset', () => {
  test('no search match → returns manual offset unchanged', () => {
    expect(effectiveScrollOffset(42, null, 100, 20, 80)).toBe(42);
    expect(effectiveScrollOffset(null, null, 100, 20, 80)).toBeNull();
  });

  test('search match centers in visible window', () => {
    // match at line 50 in 100-line buffer, 20 visible, max 80
    // offset = total - matchLine - floor(visible/2) = 100 - 50 - 10 = 40
    expect(effectiveScrollOffset(0, 50, 100, 20, 80)).toBe(40);
  });

  test('clamps when match is near the top', () => {
    // match at line 5: offset = 100 - 5 - 10 = 85, clamped to maxScroll=80
    expect(effectiveScrollOffset(0, 5, 100, 20, 80)).toBe(80);
  });

  test('clamps when match is near the bottom', () => {
    // match at line 99: offset = 100 - 99 - 10 = -9, clamped to 0
    expect(effectiveScrollOffset(0, 99, 100, 20, 80)).toBe(0);
  });

  test('search overrides manual offset', () => {
    expect(effectiveScrollOffset(99999, 50, 100, 20, 80)).toBe(40);
  });
});
