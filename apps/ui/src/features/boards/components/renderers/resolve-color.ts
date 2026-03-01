/**
 * Resolve semantic color tokens to CSS custom-property references.
 *
 * Plugin developers can use short token names like `"muted"` or `"primary"`
 * in color/background props. Renderers call these helpers to map tokens to
 * the appropriate `var(--color-…)` value. Unknown values (hex, rgb, etc.)
 * pass through unchanged.
 */

// ─── Foreground (text / icon) context ────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  foreground: 'var(--color-foreground)',
  muted: 'var(--color-muted-foreground)',
  primary: 'var(--color-primary)',
  secondary: 'var(--color-secondary-foreground)',
  accent: 'var(--color-accent-foreground)',
  card: 'var(--color-card-foreground)',
  destructive: 'var(--color-destructive)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  info: 'var(--color-info)',
  border: 'var(--color-border)',
};

// ─── Background (surface) context ────────────────────────────────────────────

const BG_MAP: Record<string, string> = {
  background: 'var(--color-background)',
  card: 'var(--color-card)',
  muted: 'var(--color-muted)',
  primary: 'var(--color-primary)',
  secondary: 'var(--color-secondary)',
  accent: 'var(--color-accent)',
  destructive: 'var(--color-destructive)',
};

// ─── Token → foreground companion (for filled buttons) ──────────────────────

const FOREGROUND_PAIR: Record<string, string> = {
  primary: 'var(--color-primary-foreground)',
  secondary: 'var(--color-secondary-foreground)',
  destructive: 'var(--color-destructive-foreground)',
  accent: 'var(--color-accent-foreground)',
  muted: 'var(--color-muted-foreground)',
  card: 'var(--color-card-foreground)',
  success: 'var(--color-success-foreground)',
  warning: 'var(--color-warning-foreground)',
  info: 'var(--color-info-foreground)',
};

// ─── Public helpers ──────────────────────────────────────────────────────────

/** Resolve a `color` prop value — maps tokens to foreground-context CSS vars. */
export function resolveColor(v: string | undefined): string | undefined {
  if (!v) {
    return undefined;
  }
  return COLOR_MAP[v] ?? v;
}

/** Resolve a `background` prop value — maps tokens to surface-context CSS vars. */
export function resolveBackground(v: string | undefined): string | undefined {
  if (!v) {
    return undefined;
  }
  return BG_MAP[v] ?? v;
}

/** Check whether a value is a known semantic token (not a literal CSS color). */
export function isToken(v: string): boolean {
  return v in COLOR_MAP || v in BG_MAP;
}

/** Get the foreground companion for a token (e.g. "primary" → primary-foreground). */
export function tokenForeground(v: string): string | undefined {
  return FOREGROUND_PAIR[v];
}
