import { describe, expect, test } from 'bun:test';

import type { TokenSpec } from '../../src/tokens/types';
import {
  renderComponentsCss,
  renderRolesCss,
  renderThemeInlineLines,
  renderRootDefaultsLines,
  renderDarkOverrideLines,
  tailwindMappingValue,
  tailwindUtilityVar,
} from '../build-tokens-emit';

const scalar: TokenSpec = {
  name: 'radius',
  layer: 'scalar',
  category: 'geometry',
  defaultLight: '0.75rem',
  description: 'base radius',
};

const role: TokenSpec = {
  name: 'primary',
  layer: 'role',
  category: 'color',
  defaultLight: 'oklch(0.55 0.18 265)',
  defaultDark: 'oklch(0.7 0.16 265)',
  description: 'brand primary',
  tailwindNamespace: 'color',
};

const semanticRadius: TokenSpec = {
  name: 'radius-control',
  layer: 'role',
  category: 'geometry',
  defaultLight: 'max(0rem, calc(var(--radius) - 0.25rem))',
  description: 'control radius',
  tailwindNamespace: 'radius',
  utilityAlias: 'control',
};

const componentRadius: TokenSpec = {
  name: 'button-radius',
  layer: 'component',
  category: 'geometry',
  appliesTo: 'button',
  defaultLight: 'var(--radius-control)',
  description: 'button radius',
  themePath: 'components.button.radius',
  tailwindNamespace: 'radius',
  utilityAlias: 'button',
};

const componentColor: TokenSpec = {
  name: 'button-filled-container',
  layer: 'component',
  category: 'color',
  appliesTo: 'button',
  defaultLight: 'var(--primary)',
  description: 'button bg',
  themePath: 'components.button.filledContainer',
  tailwindNamespace: 'color',
};

describe('tailwindUtilityVar', () => {
  test('builds --<namespace>-<alias> when alias is set', () => {
    expect(tailwindUtilityVar(componentRadius)).toBe('--radius-button');
    expect(tailwindUtilityVar(semanticRadius)).toBe('--radius-control');
  });

  test('falls back to --<namespace>-<name> when alias absent', () => {
    expect(tailwindUtilityVar(role)).toBe('--color-primary');
    expect(tailwindUtilityVar(componentColor)).toBe('--color-button-filled-container');
  });

  test('throws on tokens without a tailwindNamespace', () => {
    expect(() => tailwindUtilityVar(scalar)).toThrow();
  });
});

describe('tailwindMappingValue', () => {
  test('role/scalar → var(--name)', () => {
    expect(tailwindMappingValue(role)).toBe('var(--primary)');
    expect(tailwindMappingValue(semanticRadius)).toBe('var(--radius-control)');
  });

  test('component → var(--name, <fallback>)', () => {
    expect(tailwindMappingValue(componentRadius)).toBe(
      'var(--button-radius, var(--radius-control))'
    );
    expect(tailwindMappingValue(componentColor)).toBe(
      'var(--button-filled-container, var(--primary))'
    );
  });
});

describe('renderThemeInlineLines', () => {
  test('skips tokens without a tailwindNamespace', () => {
    expect(renderThemeInlineLines([scalar])).toEqual([]);
  });

  test('emits role and component lines', () => {
    expect(renderThemeInlineLines([role, componentRadius])).toEqual([
      '--color-primary: var(--primary);',
      '--radius-button: var(--button-radius, var(--radius-control));',
    ]);
  });
});

describe('renderRootDefaultsLines', () => {
  test('emits a default line for every token regardless of layer', () => {
    expect(renderRootDefaultsLines([scalar, role, componentRadius])).toEqual([
      '--radius: 0.75rem;',
      '--primary: oklch(0.55 0.18 265);',
      '--button-radius: var(--radius-control);',
    ]);
  });

  test('returns an empty list for an empty input', () => {
    expect(renderRootDefaultsLines([])).toEqual([]);
  });
});

describe('renderDarkOverrideLines', () => {
  test('emits only tokens with a distinct defaultDark', () => {
    expect(renderDarkOverrideLines([scalar, role, semanticRadius])).toEqual([
      '--primary: oklch(0.7 0.16 265);',
    ]);
  });

  test('also emits component-layer tokens when they declare a dark override', () => {
    const componentWithDark: TokenSpec = { ...componentRadius, defaultDark: '0px' };
    expect(renderDarkOverrideLines([componentWithDark])).toEqual(['--button-radius: 0px;']);
  });
});

describe('renderRolesCss', () => {
  test('contains the three structural sections', () => {
    const css = renderRolesCss([scalar, role, semanticRadius, componentRadius]);
    expect(css).toContain('@theme inline {');
    expect(css).toContain(':root {');
    expect(css).toContain(':is(.dark, [data-mode="dark"])');
    expect(css).toContain('--color-primary: var(--primary);');
    expect(css).toContain('--radius: 0.75rem;');
    expect(css).toContain('--primary: oklch(0.7 0.16 265);');
    // Component tokens belong to the other file, not this one.
    expect(css).not.toContain('--button-radius:');
  });

  test('omits the dark block when no token has defaultDark', () => {
    const css = renderRolesCss([scalar, semanticRadius]);
    expect(css).not.toContain('[data-mode="dark"]');
  });
});

describe('renderComponentsCss', () => {
  test('emits component fallback chains in `@theme inline` and defaults in `:root`', () => {
    const css = renderComponentsCss([scalar, role, componentRadius, componentColor]);
    expect(css).toContain('@theme inline {');
    expect(css).toContain(
      '--radius-button: var(--button-radius, var(--radius-control));'
    );
    expect(css).toContain(
      '--color-button-filled-container: var(--button-filled-container, var(--primary));'
    );
    // Roles and scalars are emitted by the other file, not this one.
    expect(css).not.toContain('--color-primary:');
    // Component tokens get a literal default in `:root` so consumers can
    // reference them in arbitrary values like `h-[var(--button-height)]`
    // before any theme is applied.
    expect(css).toContain(':root {');
    expect(css).toContain('--button-radius: var(--radius-control);');
    expect(css).toContain('--button-filled-container: var(--primary);');
  });
});
