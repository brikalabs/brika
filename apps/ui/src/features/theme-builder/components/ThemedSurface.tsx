/**
 * ThemedSurface — wraps children in a scoped container styled with the
 * draft theme's CSS variables. Used by:
 *   • PreviewCanvas — the main right-hand scene preview
 *   • ComponentsSection.PreviewStage — the per-component detail preview
 *
 * Delegates token emission to Clay's `themeToCssVars` (produces a complete
 * vars map including registry defaults), then merges Brika-extension
 * fragments (shadow scale, state opacities, ...) the builder still owns.
 */

import { cn } from '@brika/clay';
import { themeToCssVars } from '@brika/clay/themes';
import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import { recipesToFragments } from '../recipes';
import type { ThemeConfig } from '../types';

type CssVar = `--${string}`;
type StyleWithVars = CSSProperties & Record<CssVar, string>;

interface ThemedSurfaceProps {
  theme: ThemeConfig;
  mode: 'light' | 'dark';
  className?: string;
  style?: CSSProperties;
  /** Stable value on `data-preview` — helps test selectors disambiguate surfaces. */
  variant?: string;
  children: ReactNode;
}

export function ThemedSurface({
  theme,
  mode,
  className,
  style,
  variant = 'true',
  children,
}: Readonly<ThemedSurfaceProps>) {
  const themedStyle = useMemo<StyleWithVars>(() => {
    const base = themeToCssVars(theme, mode) as Record<CssVar, string>;
    const extras = recipesToFragments(theme.brika, theme.colors?.light?.primary).extras;
    return {
      ...base,
      ...extras,
      fontFamily: 'var(--font-sans)',
    };
  }, [theme, mode]);

  return (
    <div
      data-preview={variant}
      className={cn('bg-background text-foreground', mode === 'dark' && 'dark', className)}
      style={{ ...themedStyle, ...style }}
    >
      {children}
    </div>
  );
}
