import { describe, expect, test } from 'bun:test';

import {
  camelToKebab,
  flattenTheme,
  flattenThemeComplete,
  getRegistryDefaults,
  renderThemeStyleSheet,
} from '../flatten';
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

describe('getRegistryDefaults', () => {
  test('returns a complete token map for both modes', () => {
    const defaults = getRegistryDefaults();
    // Layer-1 colour role
    expect(typeof defaults.light['--background']).toBe('string');
    expect(typeof defaults.light['--primary']).toBe('string');
    // Tailwind namespace duplicates: color tokens also appear under --color-*
    expect(defaults.light['--color-primary']).toBe(defaults.light['--primary']);
    // Dark map should contain the dark variant for tokens that differ in dark
    expect(typeof defaults.dark['--background']).toBe('string');
    expect(defaults.dark['--background']).not.toBe(defaults.light['--background']);
  });

  test('skips dark entries that match light (no spurious duplicate)', () => {
    const defaults = getRegistryDefaults();
    // `radius` is mode-invariant (no defaultDark), so it should NOT appear in dark.
    expect(defaults.dark['--radius']).toBeUndefined();
    // But a colour token that DOES vary in dark mode must appear there.
    expect(defaults.dark['--primary']).toBeDefined();
  });

  test('is memoized — repeated calls return the same object reference', () => {
    expect(getRegistryDefaults()).toBe(getRegistryDefaults());
  });
});

describe('flattenThemeComplete', () => {
  const baseTheme: ThemeConfig = {
    id: 'complete-test',
    name: 'Complete Test',
    description: '',
    accentSwatches: [],
    colors: { light: { primary: '#abc' }, dark: { primary: '#def' } },
  };

  test('layers theme overrides on top of every registry default', () => {
    const flat = flattenThemeComplete(baseTheme);
    // Override is applied
    expect(flat.rootVars['--primary']).toBe('#abc');
    // A registry default unrelated to the override is still present
    expect(typeof flat.rootVars['--background']).toBe('string');
    // Dark override applied on top of dark defaults
    expect(flat.darkVars['--primary']).toBe('#def');
  });

  test('darkVars covers tokens with no theme override but with a dark default', () => {
    const flat = flattenThemeComplete({
      id: 'd',
      name: 'Dark only registry',
      description: '',
      accentSwatches: [],
    });
    // Token has no theme override but the registry has a dark default
    expect(typeof flat.darkVars['--background']).toBe('string');
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
