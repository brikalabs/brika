import { Slot } from 'radix-ui';
import type { CSSProperties, ReactNode } from 'react';

import { flattenThemeComplete } from './flatten';
import type { ThemeConfig, ThemeMode } from './types';

export interface ThemeScopeProps {
  readonly theme: ThemeConfig;
  /**
   * Light or dark variant of the theme. Defaults to `'light'`. To follow
   * the document's `data-mode` attribute, read it on mount and pass it
   * here from the parent component.
   */
  readonly mode?: ThemeMode;
  /**
   * When `true`, merge the theme's identity onto the single React child
   * via Radix's `Slot`. The child must accept `data-theme` /
   * `data-mode`. Use this when the styled element already exists in
   * your tree and you don't want any extra wrapper at all.
   */
  readonly asChild?: boolean;
  /**
   * Optional class to put on the wrapper. Ignored when `asChild` is
   * true (Slot forwards to the child).
   */
  readonly className?: string;
  /**
   * Extra inline-style overrides on the wrapper. The wrapper itself
   * carries no theme tokens inline — those live in a hoisted `<style>`
   * tag for custom themes, or in `themes-static.css` for built-ins.
   */
  readonly style?: CSSProperties;
  readonly children: ReactNode;
}

/**
 * Built-in preset ids that have CSS rules in
 * `@brika/clay/styles/themes-static.css`. When a `<ThemeScope>` matches
 * one of these, no `<style>` tag is rendered: the wrapper just carries
 * `data-theme="<id>"`, and the static rule already loaded by the app
 * does the work.
 */
const BUILT_IN_IDS: ReadonlySet<string> = new Set([
  'default',
  'ocean',
  'forest',
  'sunset',
  'lavender',
  'ruby',
  'nord',
  'solarized',
  'candy',
  'dracula',
  'mono',
  'brutalist',
  'editorial',
  'terminal',
  'skeuomorph',
  'glass',
  'comic',
]);

function buildScopeCss(theme: ThemeConfig, scopeId: string): string {
  // Complete flatten — registry defaults + theme overrides — so that the
  // emitted rule fully replaces every token a globally-applied theme
  // might have set on `<html>`. Without this, a nested scope inherits
  // through any token the inner theme didn't explicitly override.
  const { rootVars, darkVars } = flattenThemeComplete(theme);
  const lines: string[] = [];

  if (Object.keys(rootVars).length > 0) {
    lines.push(`[data-theme="${scopeId}"] {`);
    for (const [name, value] of Object.entries(rootVars)) {
      lines.push(`  ${name}: ${value};`);
    }
    lines.push('}');
  }
  if (Object.keys(darkVars).length > 0) {
    lines.push(`:is(.dark, [data-mode="dark"])[data-theme="${scopeId}"] {`);
    for (const [name, value] of Object.entries(darkVars)) {
      lines.push(`  ${name}: ${value};`);
    }
    lines.push('}');
  }
  return lines.join('\n');
}

/**
 * Scope a Clay theme to a subtree without inflating the rendered HTML.
 *
 * Default mode renders a `<div>` with `display: contents` so the wrapper
 * doesn't form a layout box; CSS variables still inherit through it.
 *
 * ```tsx
 * import { ocean, ThemeScope } from "@brika/clay/themes";
 *
 * <ThemeScope theme={ocean} mode="light">
 *   <Button>Ocean button</Button>
 * </ThemeScope>
 * ```
 *
 * For zero-DOM theming, pass `asChild` and a single child element. The
 * theme attributes are merged onto the child via Radix Slot.
 *
 * ```tsx
 * <ThemeScope theme={ocean} asChild>
 *   <article className="prose">…</article>
 * </ThemeScope>
 * ```
 *
 * **No inline styles.** The wrapper carries only `data-theme="<id>"` +
 * `data-mode="<mode>"`. CSS variable rules live elsewhere:
 *
 * - **Built-in themes** (the 16 first-party presets) match selectors in
 *   `@brika/clay/styles/themes-static.css`. Import that file once at app
 *   startup and every `ThemeScope` for those themes pays just the cost
 *   of a couple of attributes — even if the same theme appears 100
 *   times on the page (lists, galleries, side-by-side previews).
 *
 * - **Custom themes** render a single `<style>` tag via React 19's
 *   stylesheet hoisting. The `href` prop dedupes by content, so
 *   identical themes used many times share one tag in the document
 *   `<head>`. The wrapper itself stays a few bytes regardless of how
 *   many tokens the theme overrides.
 *
 * To follow the document's `data-mode` instead of pinning the scope to
 * a specific mode, read `documentElement.dataset.mode` on mount and
 * pass it through; the dark-mode CSS rule activates from any ancestor's
 * `data-mode="dark"`, including this wrapper's own.
 */
export function ThemeScope({
  theme,
  mode = 'light',
  asChild = false,
  className,
  style,
  children,
}: ThemeScopeProps) {
  const isBuiltIn = BUILT_IN_IDS.has(theme.id);

  let wrapperStyle: CSSProperties | undefined;
  if (asChild) {
    wrapperStyle = style;
  } else if (style) {
    wrapperStyle = { display: 'contents', ...style };
  } else {
    wrapperStyle = { display: 'contents' };
  }

  const themeAttributes = {
    'data-theme': theme.id,
    'data-mode': mode,
    'data-clay-theme-scope': '',
  };

  const wrapped = asChild ? (
    <Slot.Root {...themeAttributes} className={className} style={wrapperStyle}>
      {children}
    </Slot.Root>
  ) : (
    <div {...themeAttributes} className={className} style={wrapperStyle}>
      {children}
    </div>
  );

  if (isBuiltIn) {
    return wrapped;
  }

  // Custom theme — emit one `<style>` whose `href` lets React 19 dedupe
  // by content across the tree. Multiple `ThemeScope`s using the same
  // custom theme share a single hoisted tag in `<head>`.
  return (
    <>
      <style href={`clay-scope-${theme.id}`} precedence="default">
        {buildScopeCss(theme, theme.id)}
      </style>
      {wrapped}
    </>
  );
}
