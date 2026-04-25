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

import plugin from 'tailwindcss/plugin';
import { TOKEN_REGISTRY } from './tokens/registry';
import type { ResolvedTokenSpec, TailwindNamespace } from './tokens/types';

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
    out[`--${token.name}`] = token.defaultLight;
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
    // 1. :root defaults — every registry token gets a value so consumers
    //    can write raw `var(--token)` references and they always resolve.
    addBase({ ':root, [data-theme="default"]': rootDefaults() });

    // 2. Dark-mode overrides — tokens with a distinct `defaultDark`.
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
