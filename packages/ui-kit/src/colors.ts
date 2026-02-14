/**
 * Semantic color tokens for theme-aware brick styling.
 *
 * Tokens resolve to CSS custom-property references (`var(--color-…)`) that the
 * browser evaluates at render time, so bricks automatically adapt to
 * the active light / dark theme without any extra logic.
 *
 * Usage:
 * ```tsx
 * import { colors } from '@brika/ui-kit'
 *
 * <Text color={colors.mutedForeground}>Secondary text</Text>
 * <Box background={colors.card}>Card surface</Box>
 *
 * // Or use shorthand token names — renderers resolve them automatically:
 * <Text color="muted">Secondary text</Text>
 * <Box background="card">Card surface</Box>
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Token types
// ─────────────────────────────────────────────────────────────────────────────

/** Shorthand token names accepted by `color` props (text / icon context). */
export type ColorToken =
  | 'foreground'
  | 'muted'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'card'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'info'
  | 'border';

/** Shorthand token names accepted by `background` props (surface context). */
export type BackgroundToken =
  | 'background'
  | 'card'
  | 'muted'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'destructive';

/** Value for a `color` prop — token name or any CSS color string. */
export type ColorValue = ColorToken | (string & {});

/** Value for a `background` prop — token name or any CSS color string. */
export type BackgroundValue = BackgroundToken | (string & {});

// ─────────────────────────────────────────────────────────────────────────────
// Runtime color object (var() CSS references)
// ─────────────────────────────────────────────────────────────────────────────

export const colors = {
  // Surface
  background: 'var(--color-background)',
  foreground: 'var(--color-foreground)',
  card: 'var(--color-card)',
  cardForeground: 'var(--color-card-foreground)',

  // Interactive
  primary: 'var(--color-primary)',
  primaryForeground: 'var(--color-primary-foreground)',
  secondary: 'var(--color-secondary)',
  secondaryForeground: 'var(--color-secondary-foreground)',
  muted: 'var(--color-muted)',
  mutedForeground: 'var(--color-muted-foreground)',
  accent: 'var(--color-accent)',
  accentForeground: 'var(--color-accent-foreground)',

  // Feedback
  destructive: 'var(--color-destructive)',
  destructiveForeground: 'var(--color-destructive-foreground)',
  success: 'var(--color-success)',
  successForeground: 'var(--color-success-foreground)',
  warning: 'var(--color-warning)',
  warningForeground: 'var(--color-warning-foreground)',
  info: 'var(--color-info)',
  infoForeground: 'var(--color-info-foreground)',

  // UI elements
  border: 'var(--color-border)',
  ring: 'var(--color-ring)',

  // Data visualization
  data1: 'var(--color-data-1)',
  data2: 'var(--color-data-2)',
  data3: 'var(--color-data-3)',
  data4: 'var(--color-data-4)',
  data5: 'var(--color-data-5)',
  data6: 'var(--color-data-6)',
  data7: 'var(--color-data-7)',
  data8: 'var(--color-data-8)',
} as const;
