/**
 * Per-token documentation.
 *
 * Used to surface tooltips in the builder UI and (in future) to power a
 * generated `tokens.md` reference. Every token the builder can edit
 * gets a `purpose` sentence and a short CSS `example` showing the most
 * common usage. Keep both concise — the tooltip has roughly 260px of
 * width to work with.
 *
 * Authoring shape: one entry per token via `m(purpose, example?)`. The
 * `cssVar` field is derived from the key, so the table-style form below
 * stays compact.
 */

export interface TokenMeta {
  /** The actual CSS custom property emitted at runtime. */
  cssVar: string;
  /** One-sentence description of what the token is FOR, not what it is. */
  purpose: string;
  /** Optional short CSS/JSX snippet showing the canonical usage. */
  example?: string;
}

/** Build a TokenMeta — derives `cssVar` from the dictionary key at expansion time. */
function expand(
  defs: Readonly<Record<string, [purpose: string, example?: string]>>
): Readonly<Record<string, TokenMeta>> {
  const out: Record<string, TokenMeta> = {};
  for (const [key, [purpose, example]] of Object.entries(defs)) {
    out[key] = example ? { cssVar: `--${key}`, purpose, example } : { cssVar: `--${key}`, purpose };
  }
  return out;
}

export const COLOR_TOKEN_META: Readonly<Record<string, TokenMeta>> = expand({
  background: ['Page-level surface. Everything sits on top of this.', 'bg-background'],
  foreground: ['Default readable text color on background.', 'text-foreground'],
  card: ['Resting surface for cards and panels.', 'bg-card'],
  'card-foreground': ['Text color inside a card.', 'text-card-foreground'],
  popover: ['Surface for floating overlays (menus, dropdowns).', 'bg-popover'],
  'popover-foreground': ['Text color inside popovers and menus.', 'text-popover-foreground'],
  primary: ['Main brand color. CTAs, active states, links.', 'bg-primary text-primary-foreground'],
  'primary-foreground': [
    'Reads on top of primary. Contrast matters here.',
    'text-primary-foreground',
  ],
  secondary: [
    'Softer alternative to primary. Secondary buttons, tags.',
    'bg-secondary text-secondary-foreground',
  ],
  'secondary-foreground': ['Reads on top of secondary.', 'text-secondary-foreground'],
  accent: ['Hover/focus highlight for interactive rows and chips.', 'hover:bg-accent'],
  'accent-foreground': ['Text color shown on top of accent.', 'hover:text-accent-foreground'],
  muted: ['Quiet background for de-emphasized sections.', 'bg-muted'],
  'muted-foreground': ['Secondary text. Captions, timestamps, help text.', 'text-muted-foreground'],
  border: ['Default border color for cards, inputs, dividers.', 'border border-border'],
  input: ['Input field border/background accent.', 'border-input'],
  ring: ['Focus ring color for keyboard navigation.', 'focus-visible:ring-ring'],
  success: [
    'Positive state: confirmation, healthy status, growth.',
    'bg-success text-success-foreground',
  ],
  'success-foreground': ['Reads on top of success.', 'text-success-foreground'],
  warning: ['Caution state: pending actions, soft warnings.', 'bg-warning text-warning-foreground'],
  'warning-foreground': ['Reads on top of warning.', 'text-warning-foreground'],
  info: ['Neutral announcement color for tips and info banners.', 'bg-info text-info-foreground'],
  'info-foreground': ['Reads on top of info.', 'text-info-foreground'],
  destructive: [
    'Negative state: errors, destructive actions.',
    'bg-destructive text-destructive-foreground',
  ],
  'destructive-foreground': ['Reads on top of destructive.', 'text-destructive-foreground'],
  'data-1': ['First data-viz series color. Charts, sparklines.', 'stroke-data-1'],
  'data-2': ['Second data-viz series color.'],
  'data-3': ['Third data-viz series color.'],
  'data-4': ['Fourth data-viz series color.'],
  'data-5': ['Fifth data-viz series color.'],
  'data-6': ['Sixth data-viz series color.'],
  'data-7': ['Seventh data-viz series color.'],
  'data-8': ['Eighth data-viz series color.'],

  /* Material-inspired surface tonal scale */
  'surface-tint': ['Tint color for the surface-container scale. Leave blank to use primary.'],
  'surface-dim': ['Dimmer than background. Sits behind elevated content.', 'bg-surface-dim'],
  'surface-bright': ['Brighter than background. Highlights, inlay.', 'bg-surface-bright'],
  'surface-container-lowest': [
    'Lowest tonal container. Subtle inset fills.',
    'bg-surface-container-lowest',
  ],
  'surface-container-low': ['Low tonal container. Quiet panels.', 'bg-surface-container-low'],
  'surface-container': ['Default tonal container. Where cards rest.', 'bg-surface-container'],
  'surface-container-high': [
    'High tonal container. Raised cards, modals.',
    'bg-surface-container-high',
  ],
  'surface-container-highest': [
    'Most elevated container. Interactive surfaces.',
    'bg-surface-container-highest',
  ],
  'outline-variant': ['Softer border variant. Dividers, inactive rails.', 'border-outline-variant'],

  /* Role container pairs */
  'primary-container': [
    'Low-tonal primary fill. Pairs with on-primary-container text.',
    'bg-primary-container text-on-primary-container',
  ],
  'on-primary-container': ['Readable text on primary-container.'],
  'secondary-container': [
    'Low-tonal secondary fill.',
    'bg-secondary-container text-on-secondary-container',
  ],
  'on-secondary-container': ['Readable text on secondary-container.'],
  'accent-container': ['Low-tonal accent fill.', 'bg-accent-container text-on-accent-container'],
  'on-accent-container': ['Readable text on accent-container.'],
  'success-container': [
    'Low-tonal success fill. Inline success banners.',
    'bg-success-container text-on-success-container',
  ],
  'on-success-container': ['Readable text on success-container.'],
  'warning-container': [
    'Low-tonal warning fill. Inline caution banners.',
    'bg-warning-container text-on-warning-container',
  ],
  'on-warning-container': ['Readable text on warning-container.'],
  'info-container': [
    'Low-tonal info fill. Inline info banners.',
    'bg-info-container text-on-info-container',
  ],
  'on-info-container': ['Readable text on info-container.'],
  'destructive-container': [
    'Low-tonal destructive fill. Inline error banners.',
    'bg-destructive-container text-on-destructive-container',
  ],
  'on-destructive-container': ['Readable text on destructive-container.'],
});

export function metaFor(token: string): TokenMeta | undefined {
  return COLOR_TOKEN_META[token];
}
