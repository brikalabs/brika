/**
 * Tests for `applyTheme` / `resetThemeVars` / `themeToCssVars`.
 *
 * Mounts a real DOM via `@happy-dom/global-registrator` so the
 * `<style id="clay-theme">` injection path runs end-to-end. Covers the
 * SSR no-op branches by stubbing `document` to undefined.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

import { applyTheme, resetThemeVars, themeToCssVars } from '../apply';
import type { ThemeConfig } from '../types';

const STYLE_TAG_ID = 'clay-theme';

const baseTheme: ThemeConfig = {
  id: 'unit-theme',
  name: 'Unit Theme',
  description: 'Fixture for apply.ts tests.',
  accentSwatches: ['#000'],
  colors: {
    light: { primary: '#abc' },
    dark: { primary: '#fff' },
  },
};

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

describe('applyTheme', () => {
  test('injects a <style id="clay-theme"> with both root and dark blocks', () => {
    const cleanup = applyTheme(baseTheme);

    const tag = document.getElementById(STYLE_TAG_ID);
    expect(tag).not.toBeNull();
    expect(tag).toBeInstanceOf(HTMLStyleElement);
    expect(tag?.textContent).toContain(':root {');
    expect(tag?.textContent).toContain('--primary: #abc;');
    expect(tag?.textContent).toContain('[data-mode="dark"]');
    expect(tag?.textContent).toContain('--primary: #fff;');

    cleanup();
    expect(document.getElementById(STYLE_TAG_ID)).toBeNull();
  });

  test('replaces an existing tag instead of duplicating', () => {
    applyTheme(baseTheme);
    const firstTag = document.getElementById(STYLE_TAG_ID);
    expect(firstTag).not.toBeNull();

    applyTheme({
      ...baseTheme,
      colors: { light: { primary: '#222' } },
    });
    const tags = document.querySelectorAll(`#${STYLE_TAG_ID}`);
    expect(tags.length).toBe(1);
    expect(tags[0]?.textContent).toContain('--primary: #222;');
    expect(tags[0]?.textContent).not.toContain('#abc');
  });

  test('returns no-op cleanup when the theme contributes no CSS', () => {
    const cleanup = applyTheme({
      id: 'empty',
      name: 'Empty',
      description: '',
      accentSwatches: [],
    });
    expect(document.getElementById(STYLE_TAG_ID)).toBeNull();
    expect(cleanup).toBeInstanceOf(Function);
    // Calling cleanup is idempotent and does not throw.
    cleanup();
  });
});

describe('resetThemeVars', () => {
  test('removes the injected style tag', () => {
    applyTheme(baseTheme);
    expect(document.getElementById(STYLE_TAG_ID)).not.toBeNull();

    resetThemeVars();
    expect(document.getElementById(STYLE_TAG_ID)).toBeNull();
  });

  test('is idempotent — second call is a no-op', () => {
    resetThemeVars();
    resetThemeVars();
    expect(document.getElementById(STYLE_TAG_ID)).toBeNull();
  });
});

describe('themeToCssVars', () => {
  test('returns the registry defaults plus theme overrides for light mode', () => {
    const vars = themeToCssVars(baseTheme, 'light');
    // Override is applied
    expect(vars['--primary']).toBe('#abc');
    // A registry default unrelated to the override is present
    expect(typeof vars['--background']).toBe('string');
  });

  test('overlays dark overrides on top of dark defaults when mode === "dark"', () => {
    const vars = themeToCssVars(baseTheme, 'dark');
    expect(vars['--primary']).toBe('#fff');
  });

  test('falls back to light overrides when no dark override is provided', () => {
    const lightOnly: ThemeConfig = {
      id: 'lo',
      name: 'Light only',
      description: '',
      accentSwatches: [],
      colors: { light: { secondary: '#888' } },
    };
    const vars = themeToCssVars(lightOnly, 'dark');
    // Secondary set in light only, still appears in the dark scope
    expect(vars['--secondary']).toBe('#888');
  });
});

describe('SSR safety', () => {
  test('applyTheme returns a no-op cleanup when document is undefined', () => {
    // Save and remove the global document so the SSR branch fires.
    const realDocument = globalThis.document;
    // biome-ignore lint/suspicious/noExplicitAny: deliberate global mutation for SSR test
    delete (globalThis as any).document;
    try {
      const cleanup = applyTheme(baseTheme);
      expect(cleanup).toBeInstanceOf(Function);
      cleanup();
    } finally {
      // biome-ignore lint/suspicious/noExplicitAny: restore for downstream tests
      (globalThis as any).document = realDocument;
    }
  });

  test('resetThemeVars is a no-op when document is undefined', () => {
    const realDocument = globalThis.document;
    // biome-ignore lint/suspicious/noExplicitAny: deliberate global mutation for SSR test
    delete (globalThis as any).document;
    try {
      // Should not throw.
      resetThemeVars();
    } finally {
      // biome-ignore lint/suspicious/noExplicitAny: restore for downstream tests
      (globalThis as any).document = realDocument;
    }
  });
});
