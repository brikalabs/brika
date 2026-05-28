/**
 * Theme contract — schema validation tests.
 */

import { describe, expect, test } from 'bun:test';
import { THEME_CONFIG_VERSION, ThemeConfig } from './theme';

describe('ThemeConfig', () => {
  test('accepts a minimal Clay-shaped theme', () => {
    const minimal = {
      version: THEME_CONFIG_VERSION,
      id: 'mono',
      name: 'Mono',
      description: 'Monochrome',
      accentSwatches: ['#000000'],
      createdAt: 0,
      updatedAt: 0,
    };
    expect(ThemeConfig.safeParse(minimal).success).toBe(true);
  });

  test('accepts a fully populated theme', () => {
    const full = {
      version: THEME_CONFIG_VERSION,
      id: 'sample',
      name: 'Sample',
      description: 'Sample theme',
      accentSwatches: ['#4a63d1', '#e3e4e8'],
      author: 'tester',
      createdAt: 1,
      updatedAt: 2,
      colors: {
        light: { background: '#ffffff', foreground: '#000000', primary: '#4a63d1' },
        dark: { background: '#000000', foreground: '#ffffff', primary: '#7a93f1' },
      },
      geometry: {
        radius: '0.75rem',
        spacing: '0.25rem',
        fontSans: 'Inter, sans-serif',
        fontMono: 'JetBrains Mono, monospace',
      },
      borders: { width: '1px' },
      motion: { duration: '220ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      focus: { width: '2px', offset: '2px' },
      components: { button: { paddingX: '1rem', cornerShape: 'bevel' } },
      brika: { motion: 'smooth', elevation: 'soft', corners: 'round' },
    };
    expect(ThemeConfig.safeParse(full).success).toBe(true);
  });

  test('rejects a theme without version', () => {
    expect(ThemeConfig.safeParse({ id: 'x', name: 'X' }).success).toBe(false);
  });

  test('rejects a theme with the wrong version literal', () => {
    expect(
      ThemeConfig.safeParse({
        version: 0,
        id: 'x',
        name: 'X',
        accentSwatches: [],
        createdAt: 0,
        updatedAt: 0,
      }).success
    ).toBe(false);
  });

  test('rejects unknown values in brika.{motion,elevation,corners}', () => {
    expect(
      ThemeConfig.safeParse({
        version: THEME_CONFIG_VERSION,
        id: 'x',
        name: 'X',
        accentSwatches: [],
        createdAt: 0,
        updatedAt: 0,
        brika: { motion: 'turbo' },
      }).success
    ).toBe(false);
  });
});
