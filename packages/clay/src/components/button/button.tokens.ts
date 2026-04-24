/**
 * Per-component token keys consumed by `Button`.
 *
 * PR #1 ships a placeholder literal list matching the Phase 5 folder template.
 * PR #2 wires these to the TS token source of truth and PR #12 lets the theme
 * builder generate its per-component controls from this file directly.
 */
export const buttonTokens = ['primary', 'primary-foreground', 'destructive', 'secondary'] as const;

export type ButtonTokenKey = (typeof buttonTokens)[number];
