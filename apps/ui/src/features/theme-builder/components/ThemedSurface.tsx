/**
 * ThemedSurface — shared wrapper that renders children inside a scoped
 * container styled with the draft theme's CSS variables.
 *
 * Used by:
 *   • PreviewCanvas — the main right-hand scene preview
 *   • ComponentsSection.PreviewStage — the per-component detail preview
 *
 * Before this existed, each call site re-derived `themeToVars` + the dark
 * class + the `fontFamily` var by hand. Centralising that here keeps the
 * three preview surfaces visually consistent and makes future additions
 * (e.g. viewport sizing, split-mode) a single-file change.
 */

import { cn } from '@brika/clay';
import { getRegistryDefaults } from '@brika/clay/themes';
import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import { type ThemeVars, themeToVars } from '../theme-css';
import type { ThemeConfig } from '../types';

const REGISTRY_DEFAULTS = getRegistryDefaults();

// React's CSSProperties doesn't declare CSS custom properties (`--foo`),
// but they're valid in the `style` prop. Intersect so extra vars pass the
// type check without any assertion.
type StyleWithVars = CSSProperties & ThemeVars;

interface ThemedSurfaceProps {
  theme: ThemeConfig;
  mode: 'light' | 'dark';
  className?: string;
  /** Forwarded to the container for sizing/layout. */
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
  const themedStyle = useMemo<StyleWithVars>(
    () => ({
      ...REGISTRY_DEFAULTS.light,
      ...(mode === 'dark' ? REGISTRY_DEFAULTS.dark : {}),
      ...themeToVars(theme, mode),
      fontFamily: 'var(--font-sans)',
    }),
    [theme, mode]
  );

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
