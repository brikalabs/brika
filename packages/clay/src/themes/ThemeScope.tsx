import { Slot } from 'radix-ui';
import type { CSSProperties, ReactNode } from 'react';

import { flattenThemeComplete, renderVarBlock } from './flatten';
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

function buildScopeCss(theme: ThemeConfig, scopeId: string): string {
  // Complete flatten — registry defaults + theme overrides — so that the
  // emitted rule fully replaces every token a globally-applied theme
  // might have set on `<html>`. Without this, a nested scope inherits
  // through any token the inner theme didn't explicitly override.
  const { rootVars, darkVars } = flattenThemeComplete(theme);
  const sections: string[] = [];

  if (Object.keys(rootVars).length > 0) {
    sections.push(`[data-theme="${scopeId}"] {\n${renderVarBlock(rootVars)}\n}`);
  }
  if (Object.keys(darkVars).length > 0) {
    sections.push(
      `:is(.dark, [data-mode="dark"])[data-theme="${scopeId}"] {\n${renderVarBlock(darkVars)}\n}`
    );
  }
  return sections.join('\n');
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
 * **One <style> per distinct theme, no matter how many scopes.** Both
 * built-in and custom themes hoist a single `<style>` tag via React 19's
 * `href`-keyed stylesheet dedup — 50 ThemeScopes of `dracula` share one
 * tag in `<head>`. The scope CSS uses `flattenThemeComplete`, which
 * pins every registry token, so the subtree is leak-resistant even
 * when a different theme is applied globally via `applyTheme`.
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

  // Always emit the scope CSS — built-in or custom alike. React 19
  // dedupes by `href`, so N scopes of the same theme produce ONE
  // `<style>` in `<head>`. `flattenThemeComplete` pins every registry
  // token in the rule, so a globally-applied theme can't leak in
  // through tokens this scope's theme didn't explicitly override.
  return (
    <>
      <style href={`clay-scope-${theme.id}`} precedence="default">
        {buildScopeCss(theme, theme.id)}
      </style>
      {wrapped}
    </>
  );
}
