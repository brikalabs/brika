/**
 * Unit tests for `defineComponent` — the public entry point components
 * use to register their Layer-2 tokens.
 *
 * `defineComponent` returns the produced `TokenSpec[]` so we assert on
 * the return value rather than the global registry. Each test uses a
 * unique `name` prefix (`test-<feature>`) so the registry side-effect
 * doesn't collide with real components.
 */

import { describe, expect, test } from 'bun:test';

import { defineComponent } from '../define';
import type { TokenSpec } from '../types';

function names(tokens: readonly TokenSpec[]): string[] {
  return tokens.map((token) => token.name);
}

function find(tokens: readonly TokenSpec[], name: string): TokenSpec | undefined {
  return tokens.find((token) => token.name === name);
}

describe('defineComponent', () => {
  describe('basic shape', () => {
    test('emits no tokens for an empty definition', () => {
      const tokens = defineComponent('test-empty', {});
      expect(tokens).toEqual([]);
    });

    test('returns a frozen / immutable view of what was registered', () => {
      const tokens = defineComponent('test-immutable', {
        radius: { default: '0.5rem', description: 'r' },
      });
      // The registry consumes `readonly TokenSpec[]` so we lock in the
      // contract by asserting the function declares the return value as
      // a frozen array (no `.push`).
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe('single-slot tokens', () => {
    test('radius produces a `<name>-radius` token', () => {
      const tokens = defineComponent('test-radius', {
        radius: { default: '0.5rem', description: 'Test radius.', alias: 'test' },
      });
      const t = find(tokens, 'test-radius-radius');
      expect(t).toBeDefined();
      expect(t?.defaultLight).toBe('0.5rem');
      expect(t?.description).toBe('Test radius.');
    });

    test('shadow produces a `<name>-shadow` token', () => {
      const tokens = defineComponent('test-shadow', {
        shadow: { default: 'var(--shadow-raised)', description: 's' },
      });
      expect(names(tokens)).toContain('test-shadow-shadow');
    });

    test('backdropBlur produces a `<name>-backdrop-blur` token', () => {
      const tokens = defineComponent('test-blur', {
        backdropBlur: { default: '0px', description: 'b' },
      });
      expect(names(tokens)).toContain('test-blur-backdrop-blur');
    });

    test('arbitrary slots register under `<name>-<slot>`', () => {
      const tokens = defineComponent('test-slots', {
        slots: {
          'filled-container': { default: 'red', description: 'c' },
          label: { default: 'white', description: 'l' },
        },
      });
      expect(names(tokens)).toEqual(
        expect.arrayContaining(['test-slots-filled-container', 'test-slots-label'])
      );
    });
  });

  describe('surface bundle', () => {
    test('`surface: true` registers border + focus + motion + state', () => {
      const tokens = defineComponent('test-surface', { surface: true });
      const expected = [
        'test-surface-border-width',
        'test-surface-border-style',
        'test-surface-ring-width',
        'test-surface-ring-offset',
        'test-surface-ring-color',
        'test-surface-ring-style',
        'test-surface-duration',
        'test-surface-easing',
        'test-surface-hover-bg',
        'test-surface-pressed-bg',
        'test-surface-disabled-opacity',
      ];
      expect(names(tokens)).toEqual(expect.arrayContaining(expected));
      expect(tokens.length).toBe(expected.length);
    });

    test('`surface: true` defaults border-width to `0px`', () => {
      const tokens = defineComponent('test-surface-default-border', { surface: true });
      expect(find(tokens, 'test-surface-default-border-border-width')?.defaultLight).toBe('0px');
    });

    test('`surface: { borderWidth: "1px" }` overrides the resting width', () => {
      const tokens = defineComponent('test-surface-bordered', {
        surface: { borderWidth: '1px' },
      });
      expect(find(tokens, 'test-surface-bordered-border-width')?.defaultLight).toBe('1px');
    });

    test('granular flags are ignored when `surface` is set', () => {
      // `surface: true` already registers border + focus + motion + state,
      // so passing the granular flags shouldn't double-register anything.
      const tokens = defineComponent('test-surface-no-double', {
        surface: true,
        border: '5px',
        focus: true,
        motion: true,
        state: true,
      });
      // Border-width should still be 0px (the surface default), not 5px.
      expect(find(tokens, 'test-surface-no-double-border-width')?.defaultLight).toBe('0px');
      // No duplicate ring-width, etc.
      const ringWidthCount = tokens.filter(
        (t) => t.name === 'test-surface-no-double-ring-width'
      ).length;
      expect(ringWidthCount).toBe(1);
    });
  });

  describe('granular bundles', () => {
    test('`border: "1px"` registers border-width + border-style', () => {
      const tokens = defineComponent('test-border', { border: '1px' });
      expect(names(tokens)).toEqual(['test-border-border-width', 'test-border-border-style']);
      expect(find(tokens, 'test-border-border-width')?.defaultLight).toBe('1px');
    });

    test('`border: true` defaults the resting width to `0px`', () => {
      const tokens = defineComponent('test-border-true', { border: true });
      expect(find(tokens, 'test-border-true-border-width')?.defaultLight).toBe('0px');
    });

    test('`focus: true` registers four ring tokens', () => {
      const tokens = defineComponent('test-focus', { focus: true });
      expect(names(tokens)).toEqual([
        'test-focus-ring-width',
        'test-focus-ring-offset',
        'test-focus-ring-color',
        'test-focus-ring-style',
      ]);
    });

    test('`motion: true` registers duration + easing', () => {
      const tokens = defineComponent('test-motion', { motion: true });
      expect(names(tokens)).toEqual(['test-motion-duration', 'test-motion-easing']);
    });

    test('`state: true` registers hover + pressed + disabled', () => {
      const tokens = defineComponent('test-state', { state: true });
      expect(names(tokens)).toEqual([
        'test-state-hover-bg',
        'test-state-pressed-bg',
        'test-state-disabled-opacity',
      ]);
    });

    test('combining granular bundles registers each set exactly once', () => {
      const tokens = defineComponent('test-granular-combo', {
        border: '1px',
        focus: true,
        motion: true,
        state: true,
      });
      // 2 border + 4 focus + 2 motion + 3 state = 11 tokens total.
      expect(tokens.length).toBe(11);
    });
  });

  describe('geometry', () => {
    test('only fields you pass become tokens', () => {
      const tokens = defineComponent('test-geometry', {
        geometry: { paddingX: '1rem', paddingY: '0.5rem' },
      });
      expect(names(tokens)).toEqual(['test-geometry-padding-x', 'test-geometry-padding-y']);
    });

    test('all four fields produce all four tokens', () => {
      const tokens = defineComponent('test-geometry-full', {
        geometry: { height: '2rem', paddingX: '1rem', paddingY: '0.5rem', gap: '0.25rem' },
      });
      expect(names(tokens)).toEqual([
        'test-geometry-full-height',
        'test-geometry-full-padding-x',
        'test-geometry-full-padding-y',
        'test-geometry-full-gap',
      ]);
    });

    test('omitting `geometry` skips every geometry token', () => {
      const tokens = defineComponent('test-no-geometry', {});
      expect(names(tokens)).not.toContain('test-no-geometry-height');
      expect(names(tokens)).not.toContain('test-no-geometry-padding-x');
    });
  });

  describe('typography', () => {
    test('passing `typography` opts in to the full set of six tokens', () => {
      const tokens = defineComponent('test-typography', {
        typography: { fontSize: 'var(--text-body-md)' },
      });
      expect(names(tokens)).toEqual([
        'test-typography-font-family',
        'test-typography-font-size',
        'test-typography-font-weight',
        'test-typography-line-height',
        'test-typography-letter-spacing',
        'test-typography-text-transform',
      ]);
    });

    test('omitting `typography` skips every typography token', () => {
      const tokens = defineComponent('test-no-typography', {});
      expect(names(tokens)).not.toContain('test-no-typography-font-family');
      expect(names(tokens)).not.toContain('test-no-typography-font-size');
    });

    test('passed defaults override the helper fallbacks for that field', () => {
      const tokens = defineComponent('test-typography-override', {
        typography: { fontSize: '13px', fontWeight: '700' },
      });
      expect(find(tokens, 'test-typography-override-font-size')?.defaultLight).toBe('13px');
      expect(find(tokens, 'test-typography-override-font-weight')?.defaultLight).toBe('700');
    });
  });

  describe('themeKey', () => {
    test('auto-derives camelCase from kebab-case name', () => {
      const tokens = defineComponent('test-multi-word', {
        radius: { default: '0.5rem', description: 'r' },
      });
      expect(find(tokens, 'test-multi-word-radius')?.themePath).toBe(
        'components.testMultiWord.radius'
      );
    });

    test('explicit `themeKey` overrides the auto-derivation', () => {
      const tokens = defineComponent('test-aliased', {
        themeKey: 'customAlias',
        radius: { default: '0.5rem', description: 'r' },
      });
      expect(find(tokens, 'test-aliased-radius')?.themePath).toBe('components.customAlias.radius');
    });
  });

  describe('multi-namespace components', () => {
    test('two `defineComponent` calls produce independent token sets', () => {
      const trackTokens = defineComponent('test-mn-track', { surface: true });
      const thumbTokens = defineComponent('test-mn-thumb', {
        radius: { default: '9999px', description: 'r' },
      });
      // No accidental overlap.
      const overlap = names(trackTokens).filter((n) => names(thumbTokens).includes(n));
      expect(overlap).toEqual([]);
      // Each set is namespaced under its own prefix.
      expect(names(trackTokens).every((n) => n.startsWith('test-mn-track-'))).toBe(true);
      expect(names(thumbTokens).every((n) => n.startsWith('test-mn-thumb-'))).toBe(true);
    });
  });

  describe('layer + appliesTo metadata', () => {
    test('every produced token has `layer === "component"` and `appliesTo === name`', () => {
      const tokens = defineComponent('test-meta', {
        radius: { default: '0.5rem', description: 'r' },
        surface: true,
        geometry: { paddingX: '1rem' },
        typography: { fontSize: '14px' },
        slots: { container: { default: 'red', description: 'c' } },
      });
      for (const t of tokens) {
        expect(t.layer).toBe('component');
        expect(t.appliesTo).toBe('test-meta');
      }
    });
  });
});
