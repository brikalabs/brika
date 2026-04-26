/**
 * Shared spacing-step shorthands used by per-component token files.
 *
 * `--spacing` is the Layer-0 base step (default `0.25rem`). Every
 * component-layer geometry default that wants to live on the same
 * grid expresses itself as `calc(var(--spacing) * N)` — when the
 * theme rescales `--spacing`, all of them follow.
 */

export const SPACING_1 = 'calc(var(--spacing) * 1)';
export const SPACING_1_5 = 'calc(var(--spacing) * 1.5)';
export const SPACING_2 = 'calc(var(--spacing) * 2)';
export const SPACING_3 = 'calc(var(--spacing) * 3)';
export const SPACING_4 = 'calc(var(--spacing) * 4)';
export const SPACING_6 = 'calc(var(--spacing) * 6)';
