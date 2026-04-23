/**
 * theme-css — single source of truth for the tokens a theme emits.
 *
 * All three consumers go through the same token list:
 *
 *   • `runtime.ts`            — injects a <style> block per custom theme
 *   • `components/PreviewCanvas.tsx` — inlines tokens for live preview
 *   • `import-export.ts`      — exports a CSS snippet for users to paste
 *
 * Adding or renaming a token happens in one place (`collectTokens`) and
 * all three call sites pick it up automatically.
 */

import type { CSSProperties } from 'react';
import { cornerClipPath, cornerShapeKeyword } from './corner-css';
import { elevationsFor, motionsFor, radiiFor, shadowScaleFor, shadowTintRgb } from './effects-css';
import type { ColorToken, ThemeColors, ThemeConfig } from './types';

/** `['--primary', '#4a63d1']` etc. — a single CSS custom-property assignment. */
export type TokenEntry = readonly [name: string, value: string];

/** Grouped so exports can print pretty comment headers. */
export interface TokenGroup {
  heading: string;
  entries: TokenEntry[];
}

const DEFAULT_SHADOW_RGB = '0 0 0';

function colorEntries(colors: ThemeColors): TokenEntry[] {
  const entries: TokenEntry[] = [];
  for (const key of Object.keys(colors) as ColorToken[]) {
    entries.push([`--${key}`, colors[key]]);
  }
  return entries;
}

/** Return every token group a theme should emit, in stable order. */
export function collectTokens(theme: ThemeConfig, mode: 'light' | 'dark'): TokenGroup[] {
  const palette = theme.colors[mode];
  const shape = cornerShapeKeyword(theme.corners);
  const clip = cornerClipPath(theme.corners, theme.radius);
  const scale = shadowScaleFor(theme.elevation);
  const elevation = elevationsFor(theme.elevation);
  const radii = radiiFor(theme.radius);
  const motion = motionsFor(theme.motion);
  const tint = theme.elevationTint
    ? (shadowTintRgb(palette.primary) ?? DEFAULT_SHADOW_RGB)
    : DEFAULT_SHADOW_RGB;

  const base: TokenEntry[] = [
    ['--radius', `${theme.radius}rem`],
    ['--spacing', `${theme.spacing ?? 0.25}rem`],
    ['--border-width', `${theme.borderWidth ?? 1}px`],
    ['--corner-shape', shape],
    ['--font-sans', theme.fonts.sans],
    ['--font-mono', theme.fonts.mono],
  ];
  if (clip) {
    base.push(['--corner-clip-path', clip]);
  }

  const semanticRadius: TokenEntry[] = [
    ['--radius-tight', radii.tight],
    ['--radius-pill', radii.pill],
    ['--radius-control', radii.control],
    ['--radius-container', radii.container],
    ['--radius-surface', radii.surface],
  ];

  const semanticElevation: TokenEntry[] = [
    ['--shadow-rgb', tint],
    ['--elevation-surface', elevation.surface],
    ['--elevation-raised', elevation.raised],
    ['--elevation-overlay', elevation.overlay],
    ['--elevation-modal', elevation.modal],
    ['--elevation-spotlight', elevation.spotlight],
  ];

  const numericShadow: TokenEntry[] = [
    ['--shadow-xs', scale.xs],
    ['--shadow-sm', scale.sm],
    ['--shadow-md', scale.md],
    ['--shadow-lg', scale.lg],
    ['--shadow-xl', scale.xl],
  ];

  const atmosphere: TokenEntry[] = [
    ['--backdrop-blur', `${theme.backdropBlur ?? 8}px`],
    ['--ring-width', `${theme.ringWidth ?? 2}px`],
    ['--ring-offset', `${theme.ringOffset ?? 2}px`],
  ];

  const semanticMotion: TokenEntry[] = [
    ['--motion-instant-duration', motion.instant.duration],
    ['--motion-instant-easing', motion.instant.easing],
    ['--motion-standard-duration', motion.standard.duration],
    ['--motion-standard-easing', motion.standard.easing],
    ['--motion-considered-duration', motion.considered.duration],
    ['--motion-considered-easing', motion.considered.easing],
    ['--motion-duration', motion.standard.duration],
    ['--motion-easing', motion.standard.easing],
  ];

  return [
    { heading: 'Base tokens', entries: base },
    { heading: 'Semantic radius — by UI purpose', entries: semanticRadius },
    { heading: 'Semantic elevation — by UI purpose', entries: semanticElevation },
    { heading: 'Numeric shadow scale (Tailwind compat)', entries: numericShadow },
    { heading: 'Atmosphere', entries: atmosphere },
    { heading: 'Semantic motion — by intent', entries: semanticMotion },
    { heading: `Color palette (${mode})`, entries: colorEntries(palette) },
  ];
}

/** Tokens for the dark palette, for selectors that only flip colors. */
export function collectDarkPaletteOverrides(theme: ThemeConfig): TokenGroup {
  const palette = theme.colors.dark;
  const tint = theme.elevationTint
    ? (shadowTintRgb(palette.primary) ?? DEFAULT_SHADOW_RGB)
    : DEFAULT_SHADOW_RGB;
  return {
    heading: 'Color palette (dark)',
    entries: [['--shadow-rgb', tint], ...colorEntries(palette)],
  };
}

/** Convert token groups into a React inline style object. */
export function tokensToCssProperties(groups: TokenGroup[]): CSSProperties {
  const style: Record<string, string> = {};
  for (const group of groups) {
    for (const [name, value] of group.entries) {
      style[name] = value;
    }
  }
  return style;
}

/** Convert a single group into a CSS declaration block (without the braces). */
export function tokensToCssText(groups: TokenGroup[], indent = '  '): string {
  const lines: string[] = [];
  for (const group of groups) {
    lines.push(`${indent}/* ${group.heading} */`);
    for (const [name, value] of group.entries) {
      lines.push(`${indent}${name}: ${value};`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
