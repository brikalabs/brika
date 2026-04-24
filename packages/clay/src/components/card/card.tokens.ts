/**
 * Per-component token keys consumed by `Card`.
 *
 * PR #1 ships a placeholder literal list matching the Phase 5 folder template.
 * PR #2 wires these to the TS token source of truth.
 */
export const cardTokens = ['card', 'card-foreground', 'border'] as const;

export type CardTokenKey = (typeof cardTokens)[number];
