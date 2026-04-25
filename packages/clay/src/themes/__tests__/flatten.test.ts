import { describe, expect, test } from 'bun:test';

import { camelToKebab, flattenTheme, renderThemeStyleSheet } from '../flatten';
import type { ThemeConfig } from '../types';

const baseTheme: ThemeConfig = {
  id: 'test',
  name: 'Test',
  description: 'Fixture for flatten tests.',
  accentSwatches: ['#000'],
};

describe('camelToKebab', () => {
  test('transforms simple camelCase', () => {
    expect(camelToKebab('outlineLabel')).toBe('outline-label');
    expect(camelToKebab('fontSans')).toBe('font-sans');
  });

  test('passes through already-lowercase values', () => {
    expect(camelToKebab('radius')).toBe('radius');
    expect(camelToKebab('shadow')).toBe('shadow');
  });

  test('handles digits cleanly', () => {
    expect(camelToKebab('text2xl')).toBe('text2xl');
    expect(camelToKebab('text2Xl')).toBe('text2-xl');
  });
});

describe('flattenTheme - colors', () => {
  test('emits both bare and color-prefixed entries for light', () => {
    const flat = flattenTheme({
      ...baseTheme,
      colors: { light: { primary: '#abc', 'card-foreground': '#def' } },
    });
    expect(flat.rootVars['--primary']).toBe('#abc');
    expect(flat.rootVars['--color-primary']).toBe('#abc');
    expect(flat.rootVars['--card-foreground']).toBe('#def');
    expect(flat.rootVars['--color-card-foreground']).toBe('#def');
    expect(flat.darkVars).toEqual({});
  });

  test('emits dark colors into the dark dictionary', () => {
    const flat = flattenTheme({
      ...baseTheme,
      colors: { dark: { primary: '#fff' } },
    });
    expect(flat.rootVars).toEqual({});
    expect(flat.darkVars['--primary']).toBe('#fff');
    expect(flat.darkVars['--color-primary']).toBe('#fff');
  });

  test('skips empty values', () => {
    const flat = flattenTheme({
      ...baseTheme,
      colors: { light: { primary: '' } },
    });
    expect(flat.rootVars).toEqual({});
  });
});

describe('flattenTheme - sections', () => {
  test('geometry maps fontSans to --font-sans', () => {
    const flat = flattenTheme({
      ...baseTheme,
      geometry: { fontSans: 'Mono', radius: '0' },
    });
    expect(flat.rootVars['--font-sans']).toBe('Mono');
    expect(flat.rootVars['--radius']).toBe('0');
  });

  test('focus.width maps to --ring-width (the irregular case)', () => {
    const flat = flattenTheme({
      ...baseTheme,
      focus: { width: '4px', offset: '6px' },
    });
    expect(flat.rootVars['--ring-width']).toBe('4px');
    expect(flat.rootVars['--ring-offset']).toBe('6px');
  });

  test('borders.width and borders.style map correctly', () => {
    const flat = flattenTheme({
      ...baseTheme,
      borders: { width: '2px', style: 'dashed' },
    });
    expect(flat.rootVars['--border-width']).toBe('2px');
    expect(flat.rootVars['--border-style']).toBe('dashed');
  });

  test('motion duration and easing map correctly', () => {
    const flat = flattenTheme({
      ...baseTheme,
      motion: { duration: '120ms', easing: 'ease-in' },
    });
    expect(flat.rootVars['--motion-duration']).toBe('120ms');
    expect(flat.rootVars['--motion-easing']).toBe('ease-in');
  });

  test('unknown section keys are silently ignored', () => {
    const flat = flattenTheme({
      ...baseTheme,
      // @ts-expect-error testing tolerant runtime behavior
      geometry: { unknownProp: 'x' },
    });
    expect(flat.rootVars).toEqual({});
  });
});

describe('flattenTheme - components', () => {
  test('emits per-component CSS vars with camelCase → kebab conversion', () => {
    const flat = flattenTheme({
      ...baseTheme,
      components: {
        button: { radius: '0.25rem', outlineLabel: '#fff' },
      },
    });
    expect(flat.rootVars['--button-radius']).toBe('0.25rem');
    expect(flat.rootVars['--button-outline-label']).toBe('#fff');
  });

  test('handles compound component names', () => {
    const flat = flattenTheme({
      ...baseTheme,
      components: {
        'switch-thumb': { radius: '8px' },
      },
    });
    expect(flat.rootVars['--switch-thumb-radius']).toBe('8px');
  });
});

describe('renderThemeStyleSheet', () => {
  test('produces both root and dark sections when both have entries', () => {
    const css = renderThemeStyleSheet({
      ...baseTheme,
      colors: { light: { primary: '#000' }, dark: { primary: '#fff' } },
    });
    expect(css).toContain(':root {');
    expect(css).toContain(':is(.dark, [data-mode="dark"]):root {');
    expect(css).toContain('--primary: #000;');
    expect(css).toContain('--primary: #fff;');
  });

  test('omits dark section when no dark vars', () => {
    const css = renderThemeStyleSheet({
      ...baseTheme,
      colors: { light: { primary: '#000' } },
    });
    expect(css).toContain(':root {');
    expect(css).not.toContain('[data-mode="dark"]');
  });

  test('returns empty string when theme contributes nothing', () => {
    expect(renderThemeStyleSheet(baseTheme)).toBe('');
  });

  test('keys are sorted alphabetically for stable output', () => {
    const css = renderThemeStyleSheet({
      ...baseTheme,
      colors: { light: { zebra: '#z', apple: '#a' } },
    });
    const apple = css.indexOf('--apple:');
    const zebra = css.indexOf('--zebra:');
    expect(apple).toBeGreaterThan(0);
    expect(zebra).toBeGreaterThan(apple);
  });
});
