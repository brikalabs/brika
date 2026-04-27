/**
 * Tailwind v4 plugin — replaces every generated CSS file.
 *
 * Reads the TypeScript token registry at compile time and contributes:
 *
 *   1. `:root { --token: default; ... }` — every registry default
 *   2. dark-mode override block — tokens with a distinct `defaultDark`
 *   3. Tailwind theme entries — utilities like `bg-slider-fill`,
 *      `rounded-slider`, `shadow-slider-thumb` resolve through
 *      `theme.extend.{colors,borderRadius,boxShadow,…}`
 *
 * Non-default built-in themes (`dracula`, `brutalist`, …) are NOT
 * baked into CSS. They live as plain `ThemeConfig` JSON exports and
 * activate through the same runtime path as user-authored themes —
 * `applyTheme(theme)` injects a `<style>` tag, or `<ThemeScope theme>`
 * scopes via inline-style. This is what keeps the bundle small AND
 * makes user-built custom themes a first-class peer of the built-ins.
 *
 * Usage from a consumer's CSS entry:
 *
 *   @import "tailwindcss";
 *   @plugin "@brika/clay/tailwind";
 *
 * Or via Clay's bundled stylesheet (`@import "@brika/clay/styles"`),
 * which in turn pulls this plugin in.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import plugin from 'tailwindcss/plugin';
import { TOKEN_REGISTRY } from './tokens/registry';
import type { ResolvedTokenSpec, TailwindNamespace, TokenType } from './tokens/types';

/**
 * Tokens whose `defaultLight` is a literal (not `var(...)`) get a
 * concrete `:root` value — that's their whole job. Tokens whose default
 * is a `var()` chain only need to be in `:root` if some hand-authored
 * CSS reads them directly (e.g. `var(--button-duration)` in
 * `components/button/button.css`); otherwise the same fallback chain
 * is reachable through the Tailwind utility
 * (`theme.extend.transitionDuration`), and emitting them in `:root` is
 * dead weight.
 *
 * Hand-authored CSS lives in two places now: `styles/*.css` (manifest
 * + cross-cutting orphan utilities + the `[data-clay-theme-scope]`
 * reset) and per-component `components/<name>/<name>.css` files. We
 * scan both at plugin compile time and union the `var(--...)` matches.
 */
function readSourceCss(here: string): string {
  const parts: string[] = [];
  const stylesDir = join(here, 'styles');
  try {
    for (const entry of readdirSync(stylesDir)) {
      if (!entry.endsWith('.css')) {
        continue;
      }
      parts.push(readFileSync(join(stylesDir, entry), 'utf8'));
    }
  } catch {
    // styles/ missing — leave `parts` empty and fall through to the
    // outer catch in `readDirectVarReferences`.
  }
  const componentsDir = join(here, 'components');
  try {
    for (const name of readdirSync(componentsDir)) {
      const folder = join(componentsDir, name);
      if (!statSync(folder).isDirectory()) {
        continue;
      }
      try {
        parts.push(readFileSync(join(folder, `${name}.css`), 'utf8'));
      } catch {
        // No `<name>.css` in this component folder — skip silently.
      }
    }
  } catch {
    // components/ missing — same fallback semantics as above.
  }
  return parts.join('\n');
}

function readDirectVarReferences(): ReadonlySet<string> {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readSourceCss(here);
    const found = new Set<string>();
    for (const match of css.matchAll(/var\(--([a-z][a-z0-9-]*)/g)) {
      found.add(match[1]);
    }
    return found;
  } catch {
    // Fail-safe: if files can't be read, behave as if every token is
    // referenced — bigger CSS but never a missing-var bug.
    return new Set(TOKEN_REGISTRY.map((t) => t.name));
  }
}

const COMPONENTS_CSS_REFS = readDirectVarReferences();

const DARK_SELECTOR =
  ':is(.dark, [data-mode="dark"]):root, :is(.dark, [data-mode="dark"])[data-theme="default"]';

function utilityName(token: ResolvedTokenSpec): string {
  return token.utilityAlias ?? token.name;
}

/**
 * Right-hand side of a token's Tailwind utility entry.
 *
 *   role / scalar  → `var(--<name>)`
 *   component      → `var(--<name>, <fallback>)` so utilities still
 *                    resolve when a theme leaves the component slot
 *                    blank (the fallback is the registry default,
 *                    typically a Layer-1 role).
 */
function utilityValue(token: ResolvedTokenSpec): string {
  if (token.layer === 'component') {
    return `var(--${token.name}, ${token.defaultLight})`;
  }
  return `var(--${token.name})`;
}

function rootDefaults(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of TOKEN_REGISTRY) {
    // Layer 0/1 always get a `:root` value — they're concrete and Layer 2
    // chains fall back through them. Layer 2 tokens with a literal default
    // also need `:root` for components that read raw `var(--X)`. Tokens
    // whose default is just a `var()` chain only land here when some
    // hand-authored CSS reads them directly; otherwise the Tailwind
    // utility's fallback covers the same ground.
    if (token.layer !== 'component') {
      out[`--${token.name}`] = token.defaultLight;
      if (token.lineHeight) {
        out[`--${token.name}--line-height`] = token.lineHeight;
      }
      continue;
    }
    const isVarChain = token.defaultLight.startsWith('var(');
    if (!isVarChain || COMPONENTS_CSS_REFS.has(token.name)) {
      out[`--${token.name}`] = token.defaultLight;
    }
  }
  return out;
}

function darkOverrides(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of TOKEN_REGISTRY) {
    if (token.defaultDark && token.defaultDark !== token.defaultLight) {
      out[`--${token.name}`] = token.defaultDark;
    }
  }
  return out;
}

/**
 * CSS `@property` syntax descriptors for the token types we can register.
 *
 * Skipped types: `border-style`, `text-transform` (keyword unions —
 * `<custom-ident>` works but adds no value over the plain `:root`
 * declaration), `shadow` (no descriptor in the spec), `easing` (no
 * descriptor for cubic-bezier), `font-family` (`<custom-ident>` rejects
 * quoted strings), `corner-shape` (CSS draft, complex syntax). The
 * remaining types get type-checking AND smooth animation support.
 */
const TYPE_TO_SYNTAX: Partial<Record<TokenType, string>> = {
  color: '<color>',
  size: '<length>',
  radius: '<length>',
  'border-width': '<length>',
  duration: '<time>',
  'font-size': '<length>',
  'font-weight': '<number>',
  'line-height': '<number>',
  'letter-spacing': '<length>',
  opacity: '<number>',
  blur: '<length>',
};

/**
 * Per CSS spec, `initial-value` must be a *computed* value — `var()`
 * references and other un-resolved relative values are rejected. Any
 * default that contains `var(` is therefore not registrable; the token
 * still lands in `:root` via `rootDefaults()`, just without the typed
 * `@property` validation + animation pairing.
 */
function isLiteralValue(value: string): boolean {
  return !value.includes('var(');
}

/**
 * Emit one `@property --token { syntax: …; inherits: true; initial-value: …; }`
 * block for every token whose `type` maps to a CSS descriptor AND whose
 * default is a literal. Wrong values from custom themes get rejected at
 * parse time (the browser falls back to `initial-value`), and the
 * registered properties become animatable via CSS transitions.
 */
function buildPropertyBlocks(): Record<string, Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  for (const token of TOKEN_REGISTRY) {
    const syntax = TYPE_TO_SYNTAX[token.type];
    if (!syntax || !isLiteralValue(token.defaultLight)) {
      continue;
    }
    blocks[`@property --${token.name}`] = {
      syntax: `"${syntax}"`,
      inherits: 'true',
      'initial-value': token.defaultLight,
    };
    if (token.lineHeight && isLiteralValue(token.lineHeight)) {
      blocks[`@property --${token.name}--line-height`] = {
        syntax: '"<number>"',
        inherits: 'true',
        'initial-value': token.lineHeight,
      };
    }
  }
  return blocks;
}

type ThemeExtend = Record<string, Record<string, string>>;

/**
 * Map a namespaced token to its `theme.extend` bucket. `motion` splits
 * by suffix because durations and easings live in separate buckets;
 * `default` covers the bare-utility case Tailwind exposes via
 * `theme.extend.borderWidth.DEFAULT`. Returns `null` for tokens that
 * aren't part of a Tailwind utility namespace.
 */
function themeExtendBucket(
  token: ResolvedTokenSpec
): { readonly bucket: string; readonly key: string } | null {
  const ns: TailwindNamespace | undefined = token.tailwindNamespace;
  if (!ns || ns === 'none') {
    return null;
  }
  const key = utilityName(token);
  const NS_TO_BUCKET: Partial<Record<TailwindNamespace, string>> = {
    color: 'colors',
    radius: 'borderRadius',
    shadow: 'boxShadow',
    font: 'fontFamily',
    text: 'fontSize',
    opacity: 'opacity',
    blur: 'blur',
  };
  const bucket = NS_TO_BUCKET[ns];
  if (bucket) {
    return { bucket, key };
  }
  if (ns === 'motion') {
    if (token.name.endsWith('-duration')) {
      return { bucket: 'transitionDuration', key };
    }
    if (token.name.endsWith('-easing')) {
      return { bucket: 'transitionTimingFunction', key };
    }
    return null;
  }
  if (ns === 'default' && token.name === 'border-width') {
    return { bucket: 'borderWidth', key: 'DEFAULT' };
  }
  return null;
}

/**
 * Map every namespaced registry token into the v3-style `theme.extend`
 * config Tailwind v4 still consumes through its compat layer. The result
 * is identical to what the old `@theme inline { ... }` block produced —
 * `bg-slider-fill`, `rounded-slider`, `shadow-slider-thumb`, etc. all
 * become real utilities.
 */
function buildThemeExtend(): ThemeExtend {
  const extend: ThemeExtend = {};
  for (const token of TOKEN_REGISTRY) {
    const slot = themeExtendBucket(token);
    if (!slot) {
      continue;
    }
    extend[slot.bucket] ??= {};
    extend[slot.bucket][slot.key] = utilityValue(token);
  }
  return extend;
}

const clayTailwindPlugin: ReturnType<typeof plugin> = plugin(
  ({ addBase }) => {
    // 1. `@property` registrations — typed tokens (literal defaults only)
    //    so the browser type-checks custom-theme overrides and animations
    //    interpolate correctly. Tokens with `var()` defaults stay
    //    unregistered (CSS forbids `var()` in `initial-value`).
    addBase(buildPropertyBlocks());

    // 2. :root defaults — every registry token gets a value so consumers
    //    can write raw `var(--token)` references and they always resolve.
    addBase({ ':root, [data-theme="default"]': rootDefaults() });

    // 3. Dark-mode overrides — tokens with a distinct `defaultDark`.
    const darkVars = darkOverrides();
    if (Object.keys(darkVars).length > 0) {
      addBase({ [DARK_SELECTOR]: darkVars });
    }
    // Non-default built-in themes (dracula, brutalist, …) live as plain
    // `ThemeConfig` JSON and activate at runtime through `applyTheme()`
    // — same path as user-authored custom themes. Skipping them here is
    // what keeps this bundle from inflating by ~370 KB.
  },
  {
    theme: {
      extend: buildThemeExtend(),
    },
  }
);

export default clayTailwindPlugin;
