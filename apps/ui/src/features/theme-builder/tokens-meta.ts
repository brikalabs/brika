/**
 * Per-token documentation.
 *
 * Used to surface tooltips in the builder UI and (in future) to power a
 * generated `tokens.md` reference. Every token the builder can edit
 * gets a `purpose` sentence and a short CSS `example` showing the most
 * common usage. Keep both concise — the tooltip has roughly 260px of
 * width to work with.
 */

import type { ColorToken } from './types';

export interface TokenMeta {
  /** The actual CSS custom property emitted at runtime. */
  cssVar: string;
  /** One-sentence description of what the token is FOR, not what it is. */
  purpose: string;
  /** Optional short CSS/JSX snippet showing the canonical usage. */
  example?: string;
}

export const COLOR_TOKEN_META: Partial<Record<ColorToken, TokenMeta>> = {
  background: {
    cssVar: '--background',
    purpose: 'Page-level surface. Everything sits on top of this.',
    example: 'bg-background',
  },
  foreground: {
    cssVar: '--foreground',
    purpose: 'Default readable text color on background.',
    example: 'text-foreground',
  },
  card: {
    cssVar: '--card',
    purpose: 'Resting surface for cards and panels.',
    example: 'bg-card',
  },
  'card-foreground': {
    cssVar: '--card-foreground',
    purpose: 'Text color inside a card.',
    example: 'text-card-foreground',
  },
  popover: {
    cssVar: '--popover',
    purpose: 'Surface for floating overlays (menus, dropdowns).',
    example: 'bg-popover',
  },
  'popover-foreground': {
    cssVar: '--popover-foreground',
    purpose: 'Text color inside popovers and menus.',
    example: 'text-popover-foreground',
  },
  primary: {
    cssVar: '--primary',
    purpose: 'Main brand color. CTAs, active states, links.',
    example: 'bg-primary text-primary-foreground',
  },
  'primary-foreground': {
    cssVar: '--primary-foreground',
    purpose: 'Reads on top of primary. Contrast matters here.',
    example: 'text-primary-foreground',
  },
  secondary: {
    cssVar: '--secondary',
    purpose: 'Softer alternative to primary. Secondary buttons, tags.',
    example: 'bg-secondary text-secondary-foreground',
  },
  'secondary-foreground': {
    cssVar: '--secondary-foreground',
    purpose: 'Reads on top of secondary.',
    example: 'text-secondary-foreground',
  },
  accent: {
    cssVar: '--accent',
    purpose: 'Hover/focus highlight for interactive rows and chips.',
    example: 'hover:bg-accent',
  },
  'accent-foreground': {
    cssVar: '--accent-foreground',
    purpose: 'Text color shown on top of accent.',
    example: 'hover:text-accent-foreground',
  },
  muted: {
    cssVar: '--muted',
    purpose: 'Quiet background for de-emphasized sections.',
    example: 'bg-muted',
  },
  'muted-foreground': {
    cssVar: '--muted-foreground',
    purpose: 'Secondary text. Captions, timestamps, help text.',
    example: 'text-muted-foreground',
  },
  border: {
    cssVar: '--border',
    purpose: 'Default border color for cards, inputs, dividers.',
    example: 'border border-border',
  },
  input: {
    cssVar: '--input',
    purpose: 'Input field border/background accent.',
    example: 'border-input',
  },
  ring: {
    cssVar: '--ring',
    purpose: 'Focus ring color for keyboard navigation.',
    example: 'focus-visible:ring-ring',
  },
  success: {
    cssVar: '--success',
    purpose: 'Positive state: confirmation, healthy status, growth.',
    example: 'bg-success text-success-foreground',
  },
  'success-foreground': {
    cssVar: '--success-foreground',
    purpose: 'Reads on top of success.',
    example: 'text-success-foreground',
  },
  warning: {
    cssVar: '--warning',
    purpose: 'Caution state: pending actions, soft warnings.',
    example: 'bg-warning text-warning-foreground',
  },
  'warning-foreground': {
    cssVar: '--warning-foreground',
    purpose: 'Reads on top of warning.',
    example: 'text-warning-foreground',
  },
  info: {
    cssVar: '--info',
    purpose: 'Neutral announcement color for tips and info banners.',
    example: 'bg-info text-info-foreground',
  },
  'info-foreground': {
    cssVar: '--info-foreground',
    purpose: 'Reads on top of info.',
    example: 'text-info-foreground',
  },
  destructive: {
    cssVar: '--destructive',
    purpose: 'Negative state: errors, destructive actions.',
    example: 'bg-destructive text-destructive-foreground',
  },
  'destructive-foreground': {
    cssVar: '--destructive-foreground',
    purpose: 'Reads on top of destructive.',
    example: 'text-destructive-foreground',
  },
  'data-1': {
    cssVar: '--data-1',
    purpose: 'First data-viz series color. Charts, sparklines.',
    example: 'stroke-data-1',
  },
  'data-2': {
    cssVar: '--data-2',
    purpose: 'Second data-viz series color.',
  },
  'data-3': {
    cssVar: '--data-3',
    purpose: 'Third data-viz series color.',
  },
  'data-4': {
    cssVar: '--data-4',
    purpose: 'Fourth data-viz series color.',
  },
  'data-5': {
    cssVar: '--data-5',
    purpose: 'Fifth data-viz series color.',
  },
  'data-6': {
    cssVar: '--data-6',
    purpose: 'Sixth data-viz series color.',
  },
  'data-7': {
    cssVar: '--data-7',
    purpose: 'Seventh data-viz series color.',
  },
  'data-8': {
    cssVar: '--data-8',
    purpose: 'Eighth data-viz series color.',
  },

  /* Material-inspired surface tonal scale */
  'surface-tint': {
    cssVar: '--surface-tint',
    purpose: 'Tint color for the surface-container scale. Leave blank to use primary.',
  },
  'surface-dim': {
    cssVar: '--surface-dim',
    purpose: 'Dimmer than background. Sits behind elevated content.',
    example: 'bg-surface-dim',
  },
  'surface-bright': {
    cssVar: '--surface-bright',
    purpose: 'Brighter than background. Highlights, inlay.',
    example: 'bg-surface-bright',
  },
  'surface-container-lowest': {
    cssVar: '--surface-container-lowest',
    purpose: 'Lowest tonal container. Subtle inset fills.',
    example: 'bg-surface-container-lowest',
  },
  'surface-container-low': {
    cssVar: '--surface-container-low',
    purpose: 'Low tonal container. Quiet panels.',
    example: 'bg-surface-container-low',
  },
  'surface-container': {
    cssVar: '--surface-container',
    purpose: 'Default tonal container. Where cards rest.',
    example: 'bg-surface-container',
  },
  'surface-container-high': {
    cssVar: '--surface-container-high',
    purpose: 'High tonal container. Raised cards, modals.',
    example: 'bg-surface-container-high',
  },
  'surface-container-highest': {
    cssVar: '--surface-container-highest',
    purpose: 'Most elevated container. Interactive surfaces.',
    example: 'bg-surface-container-highest',
  },
  'outline-variant': {
    cssVar: '--outline-variant',
    purpose: 'Softer border variant. Dividers, inactive rails.',
    example: 'border-outline-variant',
  },

  /* Role container pairs */
  'primary-container': {
    cssVar: '--primary-container',
    purpose: 'Low-tonal primary fill. Pairs with on-primary-container text.',
    example: 'bg-primary-container text-on-primary-container',
  },
  'on-primary-container': {
    cssVar: '--on-primary-container',
    purpose: 'Readable text on primary-container.',
  },
  'secondary-container': {
    cssVar: '--secondary-container',
    purpose: 'Low-tonal secondary fill.',
    example: 'bg-secondary-container text-on-secondary-container',
  },
  'on-secondary-container': {
    cssVar: '--on-secondary-container',
    purpose: 'Readable text on secondary-container.',
  },
  'accent-container': {
    cssVar: '--accent-container',
    purpose: 'Low-tonal accent fill.',
    example: 'bg-accent-container text-on-accent-container',
  },
  'on-accent-container': {
    cssVar: '--on-accent-container',
    purpose: 'Readable text on accent-container.',
  },
  'success-container': {
    cssVar: '--success-container',
    purpose: 'Low-tonal success fill. Inline success banners.',
    example: 'bg-success-container text-on-success-container',
  },
  'on-success-container': {
    cssVar: '--on-success-container',
    purpose: 'Readable text on success-container.',
  },
  'warning-container': {
    cssVar: '--warning-container',
    purpose: 'Low-tonal warning fill. Inline caution banners.',
    example: 'bg-warning-container text-on-warning-container',
  },
  'on-warning-container': {
    cssVar: '--on-warning-container',
    purpose: 'Readable text on warning-container.',
  },
  'info-container': {
    cssVar: '--info-container',
    purpose: 'Low-tonal info fill. Inline info banners.',
    example: 'bg-info-container text-on-info-container',
  },
  'on-info-container': {
    cssVar: '--on-info-container',
    purpose: 'Readable text on info-container.',
  },
  'destructive-container': {
    cssVar: '--destructive-container',
    purpose: 'Low-tonal destructive fill. Inline error banners.',
    example: 'bg-destructive-container text-on-destructive-container',
  },
  'on-destructive-container': {
    cssVar: '--on-destructive-container',
    purpose: 'Readable text on destructive-container.',
  },
};

export function metaFor(token: ColorToken): TokenMeta | undefined {
  return COLOR_TOKEN_META[token];
}
