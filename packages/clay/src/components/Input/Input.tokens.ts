/**
 * Per-component token keys consumed by `Input`.
 *
 * PR #1 ships a placeholder literal list matching the Phase 5 folder template.
 * PR #2 wires these to the TS token source of truth.
 */
export const inputTokens = ['input', 'background', 'foreground', 'muted-foreground'] as const;

export type InputTokenKey = (typeof inputTokens)[number];
