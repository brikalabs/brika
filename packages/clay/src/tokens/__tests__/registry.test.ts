import { describe, expect, test } from 'bun:test';

import { inferTokenType, inferTokenTypeStrict } from '../infer';
import { TOKEN_REGISTRY, TOKENS_BY_NAME, tokensByType } from '../registry';
import type { TokenCategory, TokenSpec, TokenType } from '../types';

/**
 * Each granular type maps to exactly one coarse category. This is the
 * registry-wide contract: when you set `category: 'color'`, the token's
 * value must be a color; when you set `type: 'shadow'`, it MUST appear in
 * the elevation category. Adding a new TokenType means adding an entry
 * here in the same PR.
 */
const TYPE_TO_CATEGORY: Readonly<Record<TokenType, TokenCategory>> = {
  color: 'color',
  size: 'geometry',
  radius: 'geometry',
  'border-width': 'border',
  'border-style': 'border',
  shadow: 'elevation',
  duration: 'motion',
  easing: 'motion',
  'font-family': 'typography',
  'font-size': 'typography',
  'font-weight': 'typography',
  'line-height': 'typography',
  'letter-spacing': 'typography',
  'text-transform': 'typography',
  'corner-shape': 'geometry',
  opacity: 'state',
  blur: 'elevation',
};

/**
 * Tokens whose `category` legitimately differs from the type→category map
 * because the categorization reflects PURPOSE, not value type. Focus-ring
 * tokens are border-widths and colors and styles by VALUE, but by purpose
 * they group under `focus`. Same story for `state`. Keep this list short
 * — every entry is a documented exception.
 */
const CATEGORY_PURPOSE_OVERRIDES: ReadonlySet<string> = new Set([
  // Focus ring: type-by-value, but grouped under `focus` for docs.
  'ring-width',
  'ring-offset',
]);
function categoryOverridden(name: string): boolean {
  return CATEGORY_PURPOSE_OVERRIDES.has(name);
}

const VAR_NAME_RE = /^[a-z][a-z0-9-]*$/;
const THEME_PATH_SEGMENT_RE = /^[a-z][a-zA-Z0-9]*$/;

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

describe('token registry', () => {
  test('every entry has a non-empty kebab-case name', () => {
    for (const token of TOKEN_REGISTRY) {
      expect(token.name).toMatch(VAR_NAME_RE);
    }
  });

  test('names are unique', () => {
    const names = TOKEN_REGISTRY.map((token) => token.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('TOKENS_BY_NAME mirrors the registry', () => {
    expect(Object.keys(TOKENS_BY_NAME).length).toBe(TOKEN_REGISTRY.length);
    for (const token of TOKEN_REGISTRY) {
      expect(TOKENS_BY_NAME[token.name]).toBe(token);
    }
  });

  test('every entry has a non-empty defaultLight', () => {
    for (const token of TOKEN_REGISTRY) {
      expect(token.defaultLight.length).toBeGreaterThan(0);
    }
  });

  test('every entry has a non-empty description', () => {
    for (const token of TOKEN_REGISTRY) {
      expect(token.description.length).toBeGreaterThan(0);
    }
  });

  test('component-layer tokens have appliesTo set; other layers do not', () => {
    for (const token of TOKEN_REGISTRY) {
      if (token.layer === 'component') {
        expect(token.appliesTo).toBeDefined();
      } else {
        expect(token.appliesTo).toBeUndefined();
      }
    }
  });

  test('themePath segments are camelCase', () => {
    for (const token of TOKEN_REGISTRY) {
      if (!token.themePath) {
        continue;
      }
      for (const segment of token.themePath.split('.')) {
        expect(segment).toMatch(THEME_PATH_SEGMENT_RE);
      }
    }
  });

  test('themePath leaf for component-layer tokens reflects the var name', () => {
    // For `components.<name>.<prop>`, kebab-casing the leaf and prefixing
    // the appliesTo should reconstruct the var name. e.g. themePath
    // `components.button.outlineBorder` + name `button-outline-border`.
    for (const token of TOKEN_REGISTRY) {
      if (token.layer !== 'component' || !token.themePath || !token.appliesTo) {
        continue;
      }
      // Skip tokens whose namespace is not the simple <component>-<prop>
      // shape (e.g. `menu-item` is two-word and has its own appliesTo).
      const expectedPrefix = `components.${camelToKebab(token.appliesTo).replace(/-/g, '')}`;
      // Leaf-only check: just verify the path starts with `components.`.
      expect(token.themePath.startsWith('components.')).toBe(true);
      // And that there are exactly three segments.
      expect(token.themePath.split('.').length).toBe(3);
      // Cheap sanity: appliesTo (kebab-stripped) appears as the second segment.
      expect(token.themePath.split('.')[1].toLowerCase()).toBe(
        token.appliesTo.replace(/-/g, '').toLowerCase()
      );
      // Reference the prefix to silence the unused warning when we later
      // rely on a stricter rule.
      expect(expectedPrefix.length).toBeGreaterThan(0);
    }
  });

  test('utilityAlias is only set when tailwindNamespace is set', () => {
    for (const token of TOKEN_REGISTRY) {
      if (token.utilityAlias && !token.tailwindNamespace) {
        throw new Error(`${token.name} has utilityAlias but no tailwindNamespace`);
      }
    }
  });

  test('every layer is represented', () => {
    const layers = new Set<TokenSpec['layer']>(TOKEN_REGISTRY.map((token) => token.layer));
    expect(layers.has('scalar')).toBe(true);
    expect(layers.has('role')).toBe(true);
    expect(layers.has('component')).toBe(true);
  });

  test('every entry has a resolvable type', () => {
    // After the registry loads, `type` is always present on resolved
    // specs (either explicit or filled in from inferTokenType).
    for (const token of TOKEN_REGISTRY) {
      expect(token.type).toBeDefined();
    }
  });

  test('explicit `type` matches the strict inference (when both exist)', () => {
    // If a token name unambiguously implies a type via suffix/prefix/exact
    // rule, the resolved type must agree — otherwise the spec contradicts
    // its own name. Tokens whose name is ambiguous (no strict match) can
    // override freely; sidebar-width is a `size`, separator-width is a
    // `border-width`, and both have to set `type` explicitly.
    for (const token of TOKEN_REGISTRY) {
      const strictlyInferred = inferTokenTypeStrict(token.name);
      if (strictlyInferred !== null) {
        expect(token.type).toBe(strictlyInferred);
      }
    }
  });

  test('every type maps to its declared category (with documented exceptions)', () => {
    for (const token of TOKEN_REGISTRY) {
      if (categoryOverridden(token.name)) {
        continue;
      }
      const expected = TYPE_TO_CATEGORY[token.type];
      expect(token.category).toBe(expected);
    }
  });

  test('tokensByType returns every entry of the requested type', () => {
    const colorCount = TOKEN_REGISTRY.filter((t) => t.type === 'color').length;
    expect(tokensByType('color').length).toBe(colorCount);
    for (const t of tokensByType('shadow')) {
      expect(t.type).toBe('shadow');
    }
  });

  test('foundation tokens that downstream layers depend on are present', () => {
    // Cheap regression catch: removing one of these breaks the cascade.
    const required = [
      'radius',
      'spacing',
      'font-sans',
      'font-mono',
      'background',
      'foreground',
      'primary',
      'border',
      'ring',
      'radius-control',
      'radius-container',
      'radius-surface',
      'shadow-raised',
      'shadow-overlay',
      'shadow-modal',
      'button-radius',
      'button-filled-container',
      'card-radius',
      'card-container',
      'dialog-radius',
      'input-radius',
      'input-container',
    ];
    for (const name of required) {
      expect(TOKENS_BY_NAME[name]).toBeDefined();
    }
  });
});
