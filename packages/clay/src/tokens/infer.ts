/**
 * Type inference for token names.
 *
 * The Clay naming convention encodes a token's value type in its suffix
 * (and a couple of prefixes). `slider-fill` is a color, `slider-radius`
 * is a corner radius, `slider-thumb-shadow` is a box-shadow. New tokens
 * follow this rule so the type can be read from the name alone — and
 * the registry test asserts the rule across the entire registry.
 *
 * Suffix rules are checked first (most specific wins), then prefix rules,
 * then a small handful of standalone scalars that don't fit either pattern
 * (`radius`, `spacing`, …). Anything that matches none of the above is
 * treated as a `color` because that's the dominant default — every
 * component has color slots that take a role-only name (`card-container`,
 * `slider-fill`, `accent-foreground`).
 */

import type { TokenType } from './types';

/**
 * Suffix → type. Order matters — the LONGEST matching suffix wins, so the
 * list is sorted longest-first within each type family. Adding a new suffix
 * usually means appending here AND removing the now-redundant explicit
 * `type` overrides in the registry.
 */
const SUFFIX_RULES: ReadonlyArray<readonly [suffix: string, type: TokenType]> = [
  // Compound suffixes (must come before their shorter prefixes)
  ['-corner-shape', 'corner-shape'],
  ['-border-width', 'border-width'],
  ['-border-style', 'border-style'],
  ['-font-family', 'font-family'],
  ['-font-size', 'font-size'],
  ['-font-weight', 'font-weight'],
  ['-line-height', 'line-height'],
  ['-letter-spacing', 'letter-spacing'],
  ['-text-transform', 'text-transform'],
  ['-disabled-opacity', 'opacity'],
  ['-padding-x', 'size'],
  ['-padding-y', 'size'],
  ['-ring-width', 'border-width'],
  ['-ring-offset', 'size'],
  ['-ring-color', 'color'],
  ['-ring-style', 'border-style'],
  ['-track-height', 'size'],
  ['-thumb-size', 'size'],
  ['-tick-size', 'size'],
  ['-thumb-radius', 'radius'],

  // Single-segment suffixes
  ['-radius', 'radius'],
  ['-shadow', 'shadow'],
  ['-duration', 'duration'],
  ['-easing', 'easing'],
  ['-blur', 'blur'],
  ['-opacity', 'opacity'],
  ['-tracking', 'letter-spacing'],
  ['-style', 'border-style'],
  ['-height', 'size'],
  ['-size', 'size'],
  ['-gap', 'size'],
  ['-spacing', 'size'],
  // `-width` is intentionally NOT in the strict rules — it's ambiguous
  // (border thickness vs. column width). Tokens whose name ends in
  // `-width` set `type` explicitly. Compound `-border-width` / `-ring-width`
  // above catch the unambiguous cases.
];

/**
 * Prefix → type. Used for the role-level `radius-*` and `shadow-*` scales
 * (`radius-control`, `shadow-overlay`, …) where the meaningful word is at
 * the START of the name, not the end.
 */
const PREFIX_RULES: ReadonlyArray<readonly [prefix: string, type: TokenType]> = [
  ['radius-', 'radius'],
  ['shadow-', 'shadow'],
];

/**
 * Standalone names that don't fit suffix or prefix rules. These are the
 * canonical exceptions — adding to this list is a code-review signal that
 * a new naming pattern is creeping in.
 */
const EXACT_RULES: Readonly<Record<string, TokenType>> = {
  radius: 'radius',
  spacing: 'size',
  'text-base': 'font-size',
  'font-sans': 'font-family',
  'font-mono': 'font-family',
  'border-width': 'border-width',
  'border-style': 'border-style',
  'motion-duration': 'duration',
  'motion-easing': 'easing',
  'backdrop-blur': 'blur',
};

/**
 * Best-effort inference of a token's value type from its name. Returns
 * `'color'` as the documented default — the dominant role for tokens that
 * don't suffix-match (every component has unsuffixed color slots like
 * `slider-fill`, `card-container`, `accent-foreground`).
 *
 * `inferTokenTypeStrict` does the same lookup but returns `null` instead
 * of falling back to `'color'`, useful for the registry validation test.
 */
export function inferTokenType(name: string): TokenType {
  return inferTokenTypeStrict(name) ?? 'color';
}

export function inferTokenTypeStrict(name: string): TokenType | null {
  const exact = EXACT_RULES[name];
  if (exact) {
    return exact;
  }
  for (const [suffix, type] of SUFFIX_RULES) {
    if (name.endsWith(suffix)) {
      return type;
    }
  }
  for (const [prefix, type] of PREFIX_RULES) {
    if (name.startsWith(prefix)) {
      return type;
    }
  }
  return null;
}

/**
 * Reverse lookup — every TokenType plus a one-line hint about what shape
 * of value it accepts. Used by docs tooltips and theme-editor UIs.
 */
export const TOKEN_TYPE_HINT: Readonly<Record<TokenType, string>> = {
  color: 'A CSS color (oklch, hex, rgb, var(...)).',
  size: 'A length: rem, px, em, %, calc(…).',
  radius: 'A corner radius length, or 9999px for fully-pilled.',
  'border-width': 'A border / outline / ring thickness in px or rem.',
  'border-style': 'solid · dashed · double · none.',
  shadow: 'A box-shadow value, or `none`.',
  duration: 'A time: 200ms, 0.2s, 0ms (instant).',
  easing: 'cubic-bezier(…), linear, or a named easing.',
  'font-family': 'A font stack — quoted name first, fallbacks after.',
  'font-size': 'A length: rem, px, em.',
  'font-weight': 'A weight: 400, 500, 700, or named (bold).',
  'line-height': 'Unitless number, length, or percentage.',
  'letter-spacing': 'A length, often em-based.',
  'text-transform': 'uppercase · lowercase · capitalize · none.',
  'corner-shape': 'round · bevel · squircle · scoop · notch · superellipse(n).',
  opacity: 'A number 0–1.',
  blur: 'A blur length: 4px, 1rem.',
};
