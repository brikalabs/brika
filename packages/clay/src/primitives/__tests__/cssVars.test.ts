import { describe, expect, test } from 'bun:test';
import { cssVars } from '../cssVars';

describe('cssVars', () => {
  test('passes through bare names by prepending --', () => {
    const style = cssVars({ primary: '#abc', radius: '0.5rem' });
    expect(style).toEqual({
      '--primary': '#abc',
      '--radius': '0.5rem',
    });
  });

  test('keeps the leading -- when callers already include it', () => {
    const style = cssVars({ '--primary': '#000', '--radius': '0' });
    expect(style).toEqual({
      '--primary': '#000',
      '--radius': '0',
    });
  });

  test('mixes prefixed and bare keys without doubling --', () => {
    const style = cssVars({ '--primary': '#000', radius: '8px' });
    expect(style).toEqual({
      '--primary': '#000',
      '--radius': '8px',
    });
  });

  test('preserves numeric values verbatim', () => {
    const style = cssVars({ '--opacity': 0.5, weight: 600 });
    expect(style).toEqual({
      '--opacity': 0.5,
      '--weight': 600,
    });
  });

  test('returns an empty object for empty input', () => {
    expect(cssVars({})).toEqual({});
  });
});
