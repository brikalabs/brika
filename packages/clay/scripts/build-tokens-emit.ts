/**
 * Pure rendering functions for the token codegen.
 *
 * Kept dependency-free and side-effect-free so they can be unit-tested.
 * The CLI entry at `./build-tokens.ts` wires these to the filesystem.
 *
 * Output shape, designed to drop into Clay's `clay.css`:
 *
 *   tokens-roles.css
 *     ┌─ @theme inline { ... }   ← Tailwind utility mappings (--color-*, --radius-*, ...)
 *     ├─ :root { ... }           ← Light-mode defaults for scalars + roles
 *     └─ dark-mode block         ← Dark-mode overrides for scalars + roles
 *
 *   tokens-components.css
 *     └─ @theme inline { ... }   ← Per-component fallback chains
 *
 * Component-layer tokens never appear in `:root` — they are designed to be
 * undefined by default and resolve through the fallback in `@theme inline`.
 * Themes set them explicitly to override.
 */

import type { TailwindNamespace, TokenSpec } from '../src/tokens/types';

const HEADER = [
  '/**',
  ' * GENERATED FILE — do not edit by hand.',
  ' * Source: packages/clay/src/tokens/registry.ts',
  ' * Run `pnpm --filter @brika/clay build:tokens` to regenerate.',
  ' */',
  '',
].join('\n');

const DARK_SELECTOR = ':is(.dark, [data-mode="dark"]):root, :is(.dark, [data-mode="dark"])[data-theme="default"]';

const NAMESPACE_PREFIX: Record<TailwindNamespace, string> = {
  color: 'color',
  radius: 'radius',
  shadow: 'shadow',
  text: 'text',
  font: 'font',
  motion: 'motion',
  opacity: 'opacity',
  blur: 'blur',
  default: 'default',
  none: '',
};

/**
 * Resolve the Tailwind utility var name for a token. e.g. for a token named
 * `motion-instant-duration` with namespace `motion` and alias `instant`,
 * the utility var is `--motion-instant-duration`. For `--button-radius`
 * with namespace `radius` and alias `button`, the utility var is
 * `--radius-button`.
 *
 * Convention:
 *   if alias is set → `--<namespace>-<alias>`
 *   else            → `--<namespace>-<name>`
 */
export function tailwindUtilityVar(token: TokenSpec): string {
  if (!token.tailwindNamespace || token.tailwindNamespace === 'none') {
    throw new Error(`token ${token.name} has no tailwindNamespace`);
  }
  const alias = token.utilityAlias ?? token.name;
  return `--${NAMESPACE_PREFIX[token.tailwindNamespace]}-${alias}`;
}

/**
 * Right-hand expression for a token's `@theme inline` mapping.
 *
 *   role / scalar  → `var(--<name>)`
 *   component      → `var(--<name>, <fallback>)` where fallback is the
 *                    `defaultLight` expression (typically a `var(...)`
 *                    pointing at a Layer-1 role).
 */
export function tailwindMappingValue(token: TokenSpec): string {
  if (token.layer === 'component') {
    return `var(--${token.name}, ${token.defaultLight})`;
  }
  return `var(--${token.name})`;
}

function indent(lines: readonly string[], spaces = 2): string {
  const pad = ' '.repeat(spaces);
  return lines.map((line) => (line ? `${pad}${line}` : line)).join('\n');
}

/**
 * Render the `@theme inline { ... }` block content for a list of tokens
 * that have a `tailwindNamespace`. Tokens without a namespace are silently
 * skipped (they exist as raw CSS vars only).
 */
export function renderThemeInlineLines(tokens: readonly TokenSpec[]): string[] {
  const lines: string[] = [];
  for (const token of tokens) {
    if (!token.tailwindNamespace || token.tailwindNamespace === 'none') continue;
    lines.push(`${tailwindUtilityVar(token)}: ${tailwindMappingValue(token)};`);
  }
  return lines;
}

/**
 * Render the `:root { --token: value; ... }` block for the supplied tokens.
 * Use partitioning to control which tokens land in which output file —
 * `tokens-roles.css` gets scalars + roles, `tokens-components.css` gets
 * the component layer.
 */
export function renderRootDefaultsLines(tokens: readonly TokenSpec[]): string[] {
  const lines: string[] = [];
  for (const token of tokens) {
    lines.push(`--${token.name}: ${token.defaultLight};`);
  }
  return lines;
}

/**
 * Render the dark-mode override block. Only emits a line for tokens with a
 * `defaultDark` value distinct from `defaultLight`.
 */
export function renderDarkOverrideLines(tokens: readonly TokenSpec[]): string[] {
  const lines: string[] = [];
  for (const token of tokens) {
    if (!token.defaultDark || token.defaultDark === token.defaultLight) continue;
    lines.push(`--${token.name}: ${token.defaultDark};`);
  }
  return lines;
}

/**
 * Group tokens by layer for stable section ordering in the generated file.
 */
export function partitionByLayer(tokens: readonly TokenSpec[]): {
  scalars: readonly TokenSpec[];
  roles: readonly TokenSpec[];
  components: readonly TokenSpec[];
} {
  return {
    scalars: tokens.filter((t) => t.layer === 'scalar'),
    roles: tokens.filter((t) => t.layer === 'role'),
    components: tokens.filter((t) => t.layer === 'component'),
  };
}

/**
 * Render `tokens-roles.css` content. Combines:
 *   - `@theme inline` for scalar + role utility mappings
 *   - `:root` for light defaults
 *   - dark-mode override block
 */
export function renderRolesCss(tokens: readonly TokenSpec[]): string {
  const { scalars, roles } = partitionByLayer(tokens);
  const layerOnes = [...scalars, ...roles];

  const themeLines = renderThemeInlineLines(layerOnes);
  const rootLines = renderRootDefaultsLines(layerOnes);
  const darkLines = renderDarkOverrideLines(layerOnes);

  const out: string[] = [
    HEADER,
    '@theme inline {',
    indent(themeLines),
    '}',
    '',
    ':root {',
    indent(rootLines),
    '}',
  ];
  if (darkLines.length > 0) {
    out.push('', `${DARK_SELECTOR} {`, indent(darkLines), '}');
  }
  out.push('');
  return out.join('\n');
}

/**
 * Render `tokens-components.css` content. Two sections:
 *   - `@theme inline` block with the fallback chains for tokens that
 *     drive Tailwind utilities (rounded-button, bg-button-filled-container).
 *   - `:root` block with literal default values for every component-scoped
 *     token, so consumers can write `h-[var(--button-height)]` and have
 *     it resolve even before any theme is applied.
 */
export function renderComponentsCss(tokens: readonly TokenSpec[]): string {
  const { components } = partitionByLayer(tokens);
  const themeLines = renderThemeInlineLines(components);
  const rootLines = renderRootDefaultsLines(components);

  const out: string[] = [HEADER];
  if (themeLines.length > 0) {
    out.push('@theme inline {', indent(themeLines), '}', '');
  }
  if (rootLines.length > 0) {
    out.push(':root {', indent(rootLines), '}', '');
  }
  return out.join('\n');
}
