/**
 * Clay's token registry — single source of truth for every CSS custom
 * property that participates in theming.
 *
 * Step 1 covers the ~100 tokens that exist in `clay.css` today (Layer 0
 * scalars, Layer 1 roles, Layer 2 component overrides for color / radius /
 * shadow / corner-shape). Step 4 of the rollout expands Layer 2 to cover
 * border / typography / focus / motion / state for every component.
 *
 * Hand-edit only this file. The two CSS files in `src/styles/tokens-*.css`
 * are generated; rerun `pnpm --filter @brika/clay build:tokens`.
 */

import {
  borderTokens,
  controlSurfaceTokens,
  defineComponentTokens,
  focusTokens,
  geometryTokens,
  meta,
  motionTokens,
  stateTokens,
  typographyTokens,
} from './expand';
import { inferTokenType } from './infer';
import type { ResolvedTokenSpec, TokenSpec } from './types';

// ─────────────────────────────────────────────────────────────
// Layer 0 — Scalars
// One knob per concern. Themes set these; everything downstream cascades.
// ─────────────────────────────────────────────────────────────
const SCALARS: readonly TokenSpec[] = [
  {
    name: 'radius',
    layer: 'scalar',
    category: 'geometry',
    defaultLight: '0.75rem',
    description: 'Base corner radius. Drives the entire semantic radius scale.',
    themePath: 'geometry.radius',
  },
  {
    name: 'spacing',
    layer: 'scalar',
    category: 'geometry',
    defaultLight: '0.25rem',
    description: 'Base spacing step. Drives Tailwind p-/m-/gap-/size-* utilities.',
    themePath: 'geometry.spacing',
  },
  {
    name: 'text-base',
    layer: 'scalar',
    category: 'typography',
    defaultLight: '1rem',
    description: 'Reference font size. Rescales the entire typography scale.',
    themePath: 'geometry.textBase',
  },
  {
    name: 'font-sans',
    layer: 'scalar',
    category: 'typography',
    defaultLight: '"Inter", ui-sans-serif, system-ui, sans-serif',
    description: 'Default UI typeface for body and controls.',
    themePath: 'geometry.fontSans',
    tailwindNamespace: 'font',
    utilityAlias: 'sans',
  },
  {
    name: 'font-mono',
    layer: 'scalar',
    category: 'typography',
    defaultLight: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    description: 'Monospace typeface for code and tabular content.',
    themePath: 'geometry.fontMono',
    tailwindNamespace: 'font',
    utilityAlias: 'mono',
  },
  {
    name: 'border-width',
    layer: 'scalar',
    category: 'border',
    defaultLight: '1px',
    description: 'Default border width. Honored by the bare `border` utility.',
    themePath: 'borders.width',
    tailwindNamespace: 'default',
    utilityAlias: 'border-width',
  },
  {
    name: 'ring-width',
    layer: 'scalar',
    category: 'focus',
    defaultLight: '2px',
    description: 'Default focus ring width. Used by the `ring-themed` utility.',
    themePath: 'focus.width',
  },
  {
    name: 'ring-offset',
    layer: 'scalar',
    category: 'focus',
    defaultLight: '2px',
    description: 'Default focus ring offset. Used by `ring-themed`.',
    themePath: 'focus.offset',
  },
  {
    name: 'motion-duration',
    layer: 'scalar',
    category: 'motion',
    defaultLight: '220ms',
    description: 'Base transition duration. Derived motion channels scale from this.',
    themePath: 'motion.duration',
  },
  {
    name: 'motion-easing',
    layer: 'scalar',
    category: 'motion',
    defaultLight: 'cubic-bezier(0.16, 1, 0.3, 1)',
    description: 'Base transition easing. Used by the `ease-standard` utility.',
    themePath: 'motion.easing',
  },
  {
    name: 'backdrop-blur',
    layer: 'scalar',
    category: 'elevation',
    defaultLight: '8px',
    description: 'Default backdrop blur. Honored by `backdrop-blur-theme`.',
    themePath: 'geometry.backdropBlur',
    tailwindNamespace: 'blur',
    utilityAlias: 'theme',
  },
  // Glass — translucent tint applied above floating surfaces. Themes set
  // a soft `rgba(...)` to make tinted-glass effects (e.g. iOS-style
  // frosted panels). `transparent` by default so it's a no-op.
  {
    name: 'glass-tint',
    layer: 'scalar',
    category: 'color',
    defaultLight: 'transparent',
    description: 'Tint colour layered above blurred surfaces. Use rgba/oklch with alpha.',
    themePath: 'glass.tint',
  },
  // Numeric shadow scale — ensures the cascade resolves regardless of
  // Tailwind preflight behaviour. The semantic shadows
  // (`shadow-surface/raised/overlay/modal/spotlight`) reference these.
  // Themes can flatten them all to `none` (Brutalist/Terminal) or push
  // them harder (Skeuomorph) without touching Tailwind.
  {
    name: 'shadow-xs',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 1px rgb(0 0 0 / 0.05)',
    description: 'Smallest numeric shadow. Underpins `shadow-surface`.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'xs',
  },
  {
    name: 'shadow-sm',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    description: 'Small numeric shadow. Underpins `shadow-raised`.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'sm',
  },
  {
    name: 'shadow-md',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    description: 'Medium numeric shadow. Underpins `shadow-overlay`.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'md',
  },
  {
    name: 'shadow-lg',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    description: 'Large numeric shadow. Underpins `shadow-modal`.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'lg',
  },
  {
    name: 'shadow-xl',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    description: 'Extra-large numeric shadow. Underpins `shadow-spotlight`.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'xl',
  },
  {
    name: 'shadow-2xl',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    description: 'Heaviest numeric shadow. Skeuomorph-style elevation.',
    tailwindNamespace: 'shadow',
    utilityAlias: '2xl',
  },
];

// ─────────────────────────────────────────────────────────────
// Layer 1 — Color roles
// Themes typically override these. Listed in the order they appear in
// existing presets to make migration mechanical.
// ─────────────────────────────────────────────────────────────
const COLOR_ROLES: readonly TokenSpec[] = [
  {
    name: 'background',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.99 0 0)',
    defaultDark: 'oklch(0.14 0.02 260)',
    description: 'Page background. The base canvas every surface sits on.',
    themePath: 'colors.background',
    tailwindNamespace: 'color',
  },
  {
    name: 'foreground',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.15 0.01 260)',
    defaultDark: 'oklch(0.96 0.01 260)',
    description: 'Default text color, paired with `background`.',
    themePath: 'colors.foreground',
    tailwindNamespace: 'color',
  },
  {
    name: 'card',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(1 0 0)',
    defaultDark: 'oklch(0.17 0.02 260)',
    description: 'Background for resting cards and panels.',
    themePath: 'colors.card',
    tailwindNamespace: 'color',
  },
  {
    name: 'card-foreground',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.15 0.01 260)',
    defaultDark: 'oklch(0.96 0.01 260)',
    description: 'Text color for content inside cards.',
    themePath: 'colors.cardForeground',
    tailwindNamespace: 'color',
  },
  {
    name: 'popover',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(1 0 0)',
    defaultDark: 'oklch(0.17 0.02 260)',
    description: 'Background for floating surfaces (popovers, dropdowns, tooltips).',
    themePath: 'colors.popover',
    tailwindNamespace: 'color',
  },
  {
    name: 'popover-foreground',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.15 0.01 260)',
    defaultDark: 'oklch(0.96 0.01 260)',
    description: 'Text color for content inside popovers.',
    themePath: 'colors.popoverForeground',
    tailwindNamespace: 'color',
  },
  {
    name: 'primary',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.55 0.18 265)',
    defaultDark: 'oklch(0.7 0.16 265)',
    description: 'Brand primary. Used for filled buttons, focus ring, links.',
    themePath: 'colors.primary',
    tailwindNamespace: 'color',
  },
  {
    name: 'primary-foreground',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.99 0 0)',
    defaultDark: 'oklch(0.14 0.02 260)',
    description: 'Text color that reads on `primary` backgrounds.',
    themePath: 'colors.primaryForeground',
    tailwindNamespace: 'color',
  },
  {
    name: 'secondary',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.94 0.005 260)',
    defaultDark: 'oklch(0.22 0.02 260)',
    description: 'Secondary surfaces and quiet button fills.',
    themePath: 'colors.secondary',
    tailwindNamespace: 'color',
  },
  {
    name: 'secondary-foreground',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.15 0.01 260)',
    defaultDark: 'oklch(0.96 0.01 260)',
    description: 'Text color paired with `secondary`.',
    themePath: 'colors.secondaryForeground',
    tailwindNamespace: 'color',
  },
  {
    name: 'muted',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.95 0.005 260)',
    defaultDark: 'oklch(0.2 0.02 260)',
    description: 'Subdued surface for placeholder content and inactive rails.',
    themePath: 'colors.muted',
    tailwindNamespace: 'color',
  },
  {
    name: 'muted-foreground',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.5 0.01 260)',
    defaultDark: 'oklch(0.65 0.02 260)',
    description: 'De-emphasized text (helper copy, captions, placeholders).',
    themePath: 'colors.mutedForeground',
    tailwindNamespace: 'color',
  },
  {
    name: 'accent',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.92 0.01 260)',
    defaultDark: 'oklch(0.25 0.02 260)',
    description: 'Hover/highlight surface for interactive items in menus and lists.',
    themePath: 'colors.accent',
    tailwindNamespace: 'color',
  },
  {
    name: 'accent-foreground',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.15 0.01 260)',
    defaultDark: 'oklch(0.96 0.01 260)',
    description: 'Text color paired with `accent`.',
    themePath: 'colors.accentForeground',
    tailwindNamespace: 'color',
  },
  {
    name: 'border',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.9 0.01 260)',
    defaultDark: 'oklch(0.25 0.02 260)',
    description: 'Default border color across the system.',
    themePath: 'colors.border',
    tailwindNamespace: 'color',
  },
  {
    name: 'input',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.9 0.01 260)',
    defaultDark: 'oklch(0.25 0.02 260)',
    description: 'Border color for input controls (input, select, textarea).',
    themePath: 'colors.input',
    tailwindNamespace: 'color',
  },
  {
    name: 'ring',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.55 0.18 265)',
    defaultDark: 'oklch(0.7 0.16 265)',
    description: 'Focus ring color. Defaults to `primary`.',
    themePath: 'colors.ring',
    tailwindNamespace: 'color',
  },

  // Feedback
  {
    name: 'success',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.55 0.16 145)',
    defaultDark: 'oklch(0.72 0.15 145)',
    description: 'Positive feedback (success toasts, confirmation states).',
    themePath: 'colors.success',
    tailwindNamespace: 'color',
  },
  {
    name: 'success-foreground',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.99 0 0)',
    defaultDark: 'oklch(0.14 0.02 260)',
    description: 'Text color paired with `success`.',
    themePath: 'colors.successForeground',
    tailwindNamespace: 'color',
  },
  {
    name: 'warning',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.65 0.14 85)',
    defaultDark: 'oklch(0.8 0.15 85)',
    description: 'Cautionary feedback (warning banners, caution states).',
    themePath: 'colors.warning',
    tailwindNamespace: 'color',
  },
  {
    name: 'warning-foreground',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.15 0.01 260)',
    defaultDark: 'oklch(0.14 0.02 260)',
    description: 'Text color paired with `warning`.',
    themePath: 'colors.warningForeground',
    tailwindNamespace: 'color',
  },
  {
    name: 'info',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.5 0.18 230)',
    defaultDark: 'oklch(0.72 0.12 230)',
    description: 'Informational feedback (tips, notes, neutral accents).',
    themePath: 'colors.info',
    tailwindNamespace: 'color',
  },
  {
    name: 'info-foreground',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.99 0 0)',
    defaultDark: 'oklch(0.14 0.02 260)',
    description: 'Text color paired with `info`.',
    themePath: 'colors.infoForeground',
    tailwindNamespace: 'color',
  },
  {
    name: 'destructive',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.55 0.22 25)',
    defaultDark: 'oklch(0.65 0.2 25)',
    description: 'Destructive actions (delete buttons, error states).',
    themePath: 'colors.destructive',
    tailwindNamespace: 'color',
  },
  {
    name: 'destructive-foreground',
    layer: 'role',
    category: 'color',
    defaultLight: 'oklch(0.99 0 0)',
    defaultDark: 'oklch(0.96 0.01 260)',
    description: 'Text color paired with `destructive`.',
    themePath: 'colors.destructiveForeground',
    tailwindNamespace: 'color',
  },
];

// ─────────────────────────────────────────────────────────────
// Layer 1 — Geometry, elevation, motion, typography roles
// Derived from scalars. Mostly stable across themes.
// ─────────────────────────────────────────────────────────────
const SEMANTIC_ROLES: readonly TokenSpec[] = [
  // Semantic radii — derived from --radius
  {
    name: 'radius-tight',
    layer: 'role',
    category: 'geometry',
    defaultLight: 'max(0rem, calc(var(--radius) - 0.625rem))',
    description: 'Tight radius for tag dots and micro shapes.',
    tailwindNamespace: 'radius',
    utilityAlias: 'tight',
  },
  {
    name: 'radius-pill',
    layer: 'role',
    category: 'geometry',
    defaultLight: 'max(0rem, calc(var(--radius) - 0.375rem))',
    description: 'Pill radius for chips, tags, and badges.',
    tailwindNamespace: 'radius',
    utilityAlias: 'pill',
  },
  {
    name: 'radius-control',
    layer: 'role',
    category: 'geometry',
    defaultLight: 'max(0rem, calc(var(--radius) - 0.25rem))',
    description: 'Radius for buttons, inputs, switches and other controls.',
    tailwindNamespace: 'radius',
    utilityAlias: 'control',
  },
  {
    name: 'radius-container',
    layer: 'role',
    category: 'geometry',
    defaultLight: 'var(--radius)',
    description: 'Radius for cards, panels, sidebars.',
    tailwindNamespace: 'radius',
    utilityAlias: 'container',
  },
  {
    name: 'radius-surface',
    layer: 'role',
    category: 'geometry',
    defaultLight: 'calc(var(--radius) + 0.25rem)',
    description: 'Radius for dialogs, sheets, popovers — surfaces that float.',
    tailwindNamespace: 'radius',
    utilityAlias: 'surface',
  },

  // Semantic shadows — alias the numeric scale.
  {
    name: 'shadow-surface',
    layer: 'role',
    category: 'elevation',
    defaultLight: 'var(--shadow-xs)',
    description: 'Subtle resting elevation (inline cards, quiet chrome).',
    tailwindNamespace: 'shadow',
    utilityAlias: 'surface',
  },
  {
    name: 'shadow-raised',
    layer: 'role',
    category: 'elevation',
    defaultLight: 'var(--shadow-sm)',
    description: 'Cards and buttons at rest or hover.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'raised',
  },
  {
    name: 'shadow-overlay',
    layer: 'role',
    category: 'elevation',
    defaultLight: 'var(--shadow-md)',
    description: 'Popovers, dropdowns, tooltips — anything floating.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'overlay',
  },
  {
    name: 'shadow-modal',
    layer: 'role',
    category: 'elevation',
    defaultLight: 'var(--shadow-lg)',
    description: 'Dialogs and sheets that command focus.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'modal',
  },
  {
    name: 'shadow-spotlight',
    layer: 'role',
    category: 'elevation',
    defaultLight: 'var(--shadow-xl)',
    description: 'Toasts and command palettes — most-elevated transient surfaces.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'spotlight',
  },

  // Motion channels
  {
    name: 'motion-instant-duration',
    layer: 'role',
    category: 'motion',
    defaultLight: 'max(80ms, calc(var(--motion-duration, 220ms) * 0.45))',
    description: 'Fastest channel — hover, focus, instant feedback.',
    tailwindNamespace: 'motion',
    utilityAlias: 'instant',
  },
  {
    name: 'motion-standard-duration',
    layer: 'role',
    category: 'motion',
    defaultLight: 'var(--motion-duration, 220ms)',
    description: 'Default transition channel for most state changes.',
    tailwindNamespace: 'motion',
    utilityAlias: 'standard',
  },
  {
    name: 'motion-considered-duration',
    layer: 'role',
    category: 'motion',
    defaultLight: 'calc(var(--motion-duration, 220ms) * 1.8)',
    description: 'Emphasized reveals — sheets, accordions, accordions.',
    tailwindNamespace: 'motion',
    utilityAlias: 'considered',
  },
  {
    name: 'motion-instant-easing',
    layer: 'role',
    category: 'motion',
    defaultLight: 'var(--motion-easing, cubic-bezier(0.16, 1, 0.3, 1))',
    description: 'Easing for the instant motion channel.',
  },
  {
    name: 'motion-standard-easing',
    layer: 'role',
    category: 'motion',
    defaultLight: 'var(--motion-easing, cubic-bezier(0.16, 1, 0.3, 1))',
    description: 'Easing for the standard motion channel.',
  },
  {
    name: 'motion-considered-easing',
    layer: 'role',
    category: 'motion',
    defaultLight: 'var(--motion-easing, cubic-bezier(0.16, 1, 0.3, 1))',
    description: 'Easing for the considered motion channel.',
  },

  // State-layer opacities
  {
    name: 'state-hover-opacity',
    layer: 'role',
    category: 'state',
    defaultLight: '0.08',
    description: 'Overlay opacity for hover state layers.',
    themePath: 'state.hoverOpacity',
    tailwindNamespace: 'opacity',
    utilityAlias: 'state-hover',
  },
  {
    name: 'state-focus-opacity',
    layer: 'role',
    category: 'state',
    defaultLight: '0.12',
    description: 'Overlay opacity for focus state layers.',
    themePath: 'state.focusOpacity',
    tailwindNamespace: 'opacity',
    utilityAlias: 'state-focus',
  },
  {
    name: 'state-pressed-opacity',
    layer: 'role',
    category: 'state',
    defaultLight: '0.16',
    description: 'Overlay opacity for pressed state layers.',
    themePath: 'state.pressedOpacity',
    tailwindNamespace: 'opacity',
    utilityAlias: 'state-pressed',
  },
  {
    name: 'state-selected-opacity',
    layer: 'role',
    category: 'state',
    defaultLight: '0.12',
    description: 'Overlay opacity for selected state layers.',
    themePath: 'state.selectedOpacity',
    tailwindNamespace: 'opacity',
    utilityAlias: 'state-selected',
  },
  {
    name: 'state-disabled-opacity',
    layer: 'role',
    category: 'state',
    defaultLight: '0.38',
    description: 'Opacity applied to disabled controls.',
    themePath: 'state.disabledOpacity',
    tailwindNamespace: 'opacity',
    utilityAlias: 'state-disabled',
  },
];

// ─────────────────────────────────────────────────────────────
// Layer 2 — Per-component overrides (existing surface)
// Step 1 covers the tokens that already exist in clay.css. Step 4
// expands these to border / typography / focus / motion / state for
// every component.
//
// `defaultLight` for component tokens is the fallback expression that
// resolves to a Layer 1 role when the theme leaves the override blank.
// ─────────────────────────────────────────────────────────────
const COMPONENT_TOKENS: readonly TokenSpec[] = [
  // Alert
  ...defineComponentTokens(meta('alert'), {
    radius: {
      default: 'var(--radius-container)',
      description: 'Alert corner radius.',
      alias: 'alert',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Alert corner geometry.',
    },
  }),

  // Avatar
  ...defineComponentTokens(meta('avatar'), {
    radius: {
      default: '9999px',
      description: 'Avatar corner radius. Default is fully circular.',
      alias: 'avatar',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Avatar corner geometry.',
    },
  }),

  // Badge
  ...defineComponentTokens(meta('badge'), {
    radius: { default: 'var(--radius-pill)', description: 'Badge corner radius.', alias: 'badge' },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Badge corner geometry.',
    },
  }),

  // Button
  ...defineComponentTokens(meta('button'), {
    radius: {
      default: 'var(--radius-control)',
      description: 'Button corner radius. Falls back to `radius-control`.',
      alias: 'button',
    },
    shadow: {
      default: 'var(--shadow-surface)',
      description: 'Resting elevation under a button.',
      alias: 'button',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Corner geometry (round / bevel / squircle / scoop / notch).',
    },
    'filled-container': {
      default: 'var(--primary)',
      description: 'Background of the filled button variant.',
    },
    'filled-label': {
      default: 'var(--primary-foreground)',
      description: 'Label color of the filled button variant.',
    },
    'outline-border': {
      default: 'var(--border)',
      description: 'Border color of the outline button variant.',
    },
    'outline-label': {
      default: 'var(--foreground)',
      description: 'Label color of the outline button variant.',
    },
  }),

  // Card
  ...defineComponentTokens(meta('card'), {
    radius: {
      default: 'var(--radius-container)',
      description: 'Card corner radius.',
      alias: 'card',
    },
    shadow: { default: 'var(--shadow-raised)', description: 'Card elevation.', alias: 'card' },
    'corner-shape': { default: 'var(--corner-shape, round)', description: 'Card corner geometry.' },
    container: { default: 'var(--card)', description: 'Card background.' },
    label: { default: 'var(--card-foreground)', description: 'Card text color.' },
  }),

  // Checkbox
  ...defineComponentTokens(meta('checkbox'), {
    radius: {
      default: 'var(--radius-tight)',
      description: 'Checkbox corner radius.',
      alias: 'checkbox',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Checkbox corner geometry.',
    },
  }),

  // Dialog
  ...defineComponentTokens(meta('dialog'), {
    radius: {
      default: 'var(--radius-surface)',
      description: 'Dialog corner radius.',
      alias: 'dialog',
    },
    shadow: { default: 'var(--shadow-modal)', description: 'Dialog elevation.', alias: 'dialog' },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Dialog corner geometry.',
    },
    container: { default: 'var(--popover)', description: 'Dialog background.' },
    label: { default: 'var(--popover-foreground)', description: 'Dialog text color.' },
  }),

  // Icon
  ...defineComponentTokens(meta('icon'), {
    muted: { default: 'var(--muted-foreground)', description: 'Muted icon color.' },
    primary: {
      default: 'var(--primary)',
      description: 'Primary icon color (interactive accents).',
    },
  }),

  // Input
  ...defineComponentTokens(meta('input'), {
    radius: {
      default: 'var(--radius-control)',
      description: 'Input corner radius.',
      alias: 'input',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Input corner geometry.',
    },
    container: { default: 'var(--background)', description: 'Input background.' },
    label: { default: 'var(--foreground)', description: 'Input text color.' },
    border: { default: 'var(--input)', description: 'Input border color.' },
    placeholder: {
      default: 'var(--muted-foreground)',
      description: 'Input placeholder text color.',
    },
  }),

  // Menu
  ...defineComponentTokens(meta('menu'), {
    radius: {
      default: 'var(--radius-surface)',
      description: 'Menu surface corner radius.',
      alias: 'menu',
    },
    shadow: {
      default: 'var(--shadow-overlay)',
      description: 'Menu surface elevation.',
      alias: 'menu',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Menu surface corner geometry.',
    },
  }),

  // Menu-item
  ...defineComponentTokens(meta('menu-item'), {
    radius: {
      default: 'var(--radius-control)',
      description: 'Menu-item corner radius.',
      alias: 'menu-item',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Menu-item corner geometry.',
    },
  }),

  // Popover
  ...defineComponentTokens(meta('popover'), {
    radius: {
      default: 'var(--radius-surface)',
      description: 'Popover corner radius.',
      alias: 'popover',
    },
    shadow: {
      default: 'var(--shadow-overlay)',
      description: 'Popover elevation.',
      alias: 'popover',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Popover corner geometry.',
    },
  }),

  // Select
  ...defineComponentTokens(meta('select'), {
    radius: {
      default: 'var(--radius-control)',
      description: 'Select trigger corner radius.',
      alias: 'select',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Select corner geometry.',
    },
  }),

  // Switch
  ...defineComponentTokens(meta('switch'), {
    radius: {
      default: '9999px',
      description: 'Switch track corner radius. Default is fully rounded.',
      alias: 'switch',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Switch track corner geometry.',
    },
  }),

  // Switch-thumb
  ...defineComponentTokens(meta('switch-thumb'), {
    radius: {
      default: '9999px',
      description: 'Switch thumb corner radius.',
      alias: 'switch-thumb',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Switch thumb corner geometry.',
    },
  }),

  // Tabs
  ...defineComponentTokens(meta('tabs'), {
    radius: { default: 'var(--radius-control)', description: 'Tabs corner radius.', alias: 'tabs' },
    'corner-shape': { default: 'var(--corner-shape, round)', description: 'Tabs corner geometry.' },
  }),

  // Toast
  ...defineComponentTokens(meta('toast'), {
    radius: {
      default: 'var(--radius-container)',
      description: 'Toast corner radius.',
      alias: 'toast',
    },
    shadow: { default: 'var(--shadow-spotlight)', description: 'Toast elevation.', alias: 'toast' },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Toast corner geometry.',
    },
  }),

  // Tooltip
  ...defineComponentTokens(meta('tooltip'), {
    radius: {
      default: 'var(--radius-control)',
      description: 'Tooltip corner radius.',
      alias: 'tooltip',
    },
    shadow: {
      default: 'var(--shadow-overlay)',
      description: 'Tooltip elevation.',
      alias: 'tooltip',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Tooltip corner geometry.',
    },
  }),

  // Irregular blocks not migrated.
  {
    name: 'icon',
    layer: 'component',
    category: 'color',
    appliesTo: 'icon',
    defaultLight: 'var(--foreground)',
    description: 'Default icon color.',
    themePath: 'components.icon.default',
    tailwindNamespace: 'color',
  },
];

// ─────────────────────────────────────────────────────────────
// Layer 2 — Per-component expansion
// Generated through the helpers in `./expand.ts` so each component's
// surface stays consistent. Hand-curated geometry defaults reflect the
// existing Tailwind class numbers (h-9 = 2.25rem, px-4 = 1rem, etc.).
// ─────────────────────────────────────────────────────────────

// Padding / gap shorthands shared by the helper spreads below.
const SPACING_1 = 'calc(var(--spacing) * 1)';
const SPACING_1_5 = 'calc(var(--spacing) * 1.5)';
const SPACING_2 = 'calc(var(--spacing) * 2)';
const SPACING_3 = 'calc(var(--spacing) * 3)';
const SPACING_4 = 'calc(var(--spacing) * 4)';
const SPACING_6 = 'calc(var(--spacing) * 6)';

const COMPONENT_EXPANSIONS: readonly TokenSpec[] = [
  // ─── Helper-driven control / surface tokens ────────────────────
  // These spreads emit the regular geometry / border / focus / motion /
  // typography / state tokens per component (height, padding-x/y, gap,
  // border-width/style, ring-*, duration/easing, font-*, hover/pressed/
  // disabled overlays). Hand-authored irregular tokens live in
  // `defineComponentTokens` calls further down.

  ...controlSurfaceTokens(
    meta('button'),
    { height: '2.25rem', paddingX: SPACING_4, paddingY: SPACING_2, gap: SPACING_2 },
    { fontWeight: '500', fontSize: 'var(--text-body-md)' }
  ),

  ...controlSurfaceTokens(
    meta('input'),
    { height: '2.25rem', paddingX: SPACING_3, paddingY: SPACING_2, gap: SPACING_2 },
    { fontSize: 'var(--text-body-md)' },
    '1px'
  ),

  ...controlSurfaceTokens(
    meta('textarea'),
    { paddingX: SPACING_3, paddingY: SPACING_2, gap: SPACING_2 },
    { fontSize: 'var(--text-body-md)' },
    '1px'
  ),

  ...controlSurfaceTokens(
    meta('password-input', 'passwordInput'),
    { height: '2.25rem', paddingX: SPACING_3, paddingY: SPACING_2 },
    { fontSize: 'var(--text-body-md)' },
    '1px'
  ),

  ...controlSurfaceTokens(
    meta('select'),
    { height: '2.25rem', paddingX: SPACING_3, paddingY: SPACING_2, gap: SPACING_2 },
    { fontSize: 'var(--text-body-md)' },
    '1px'
  ),

  ...borderTokens(meta('card'), '1px'),
  ...motionTokens(meta('card')),
  ...typographyTokens(meta('card'), { fontSize: 'var(--text-body-md)' }),
  ...geometryTokens(meta('card'), { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 }),

  ...borderTokens(meta('dialog'), '1px'),
  ...focusTokens(meta('dialog')),
  ...motionTokens(meta('dialog')),
  ...geometryTokens(meta('dialog'), { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 }),

  ...borderTokens(meta('sheet'), '1px'),
  ...motionTokens(meta('sheet')),
  ...geometryTokens(meta('sheet'), { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 }),

  ...borderTokens(meta('popover'), '1px'),
  ...motionTokens(meta('popover')),
  ...geometryTokens(meta('popover'), { paddingX: SPACING_3, paddingY: SPACING_3, gap: SPACING_2 }),

  ...borderTokens(meta('tooltip')),
  ...motionTokens(meta('tooltip')),
  ...typographyTokens(meta('tooltip'), { fontSize: 'var(--text-label-md)', fontWeight: '500' }),
  ...geometryTokens(meta('tooltip'), { paddingX: SPACING_2, paddingY: SPACING_1 }),

  ...borderTokens(meta('menu'), '1px'),
  ...motionTokens(meta('menu')),
  ...geometryTokens(meta('menu'), { paddingX: SPACING_1, paddingY: SPACING_1, gap: '0.125rem' }),

  ...controlSurfaceTokens(
    meta('menu-item', 'menuItem'),
    { paddingX: SPACING_2, paddingY: SPACING_1_5, gap: SPACING_2 },
    { fontSize: 'var(--text-body-md)' }
  ),

  ...controlSurfaceTokens(
    meta('badge'),
    { height: '1.5rem', paddingX: SPACING_2, paddingY: '0.125rem', gap: SPACING_1 },
    { fontSize: 'var(--text-label-md)' }
  ),

  ...borderTokens(meta('tabs'), '1px'),
  ...motionTokens(meta('tabs')),
  ...focusTokens(meta('tabs')),
  ...stateTokens(meta('tabs')),
  ...typographyTokens(meta('tabs'), { fontSize: 'var(--text-label-lg)', fontWeight: '500' }),

  ...controlSurfaceTokens(meta('switch'), {}, {}, '0px'),

  ...controlSurfaceTokens(meta('checkbox'), {}, {}, '1px'),

  // Avatar
  ...defineComponentTokens(meta('avatar'), {
    size: { default: '2rem', description: 'Avatar diameter at the default size.' },
  }),

  // Card
  ...defineComponentTokens(meta('card'), {
    'backdrop-blur': {
      default: '0px',
      description: 'Backdrop blur applied behind a translucent card. Set non-zero for glass.',
    },
  }),

  // Checkbox
  ...defineComponentTokens(meta('checkbox'), {
    size: { default: '1rem', description: 'Checkbox box edge length.' },
  }),

  // Code-block
  ...defineComponentTokens(meta('code-block'), {
    bg: { default: 'var(--muted)', description: 'Code block background.' },
    radius: {
      default: 'var(--radius-control)',
      description: 'Code block corner radius.',
      alias: 'code-block',
    },
  }),

  // Dialog
  ...defineComponentTokens(meta('dialog'), {
    'backdrop-blur': {
      default: '0px',
      description: 'Backdrop blur applied behind a translucent dialog.',
    },
  }),

  // Menu
  ...defineComponentTokens(meta('menu'), {
    'backdrop-blur': {
      default: '0px',
      description: 'Backdrop blur applied behind a translucent dropdown menu.',
    },
  }),

  // Popover
  ...defineComponentTokens(meta('popover'), {
    'backdrop-blur': {
      default: '0px',
      description: 'Backdrop blur applied behind a translucent popover.',
    },
  }),

  // Progress
  ...defineComponentTokens(meta('progress'), {
    'track-color': {
      default: 'var(--secondary)',
      description: 'Background of the progress track.',
    },
    'indicator-color': {
      default: 'var(--primary)',
      description: 'Foreground of the progress indicator.',
    },
    'track-height': { default: '0.5rem', description: 'Progress track thickness.' },
  }),

  // Separator
  ...defineComponentTokens(meta('separator'), {
    color: { default: 'var(--border)', description: 'Separator line color.' },
    width: { default: '1px', description: 'Separator line thickness.' },
    style: { default: 'solid', description: 'Separator line style (`solid`, `dashed`, `double`).' },
  }),

  // Sheet
  ...defineComponentTokens(meta('sheet'), {
    radius: {
      default: 'var(--radius-surface)',
      description: 'Sheet corner radius.',
      alias: 'sheet',
    },
    shadow: { default: 'var(--shadow-modal)', description: 'Sheet elevation.', alias: 'sheet' },
    'backdrop-blur': {
      default: '0px',
      description: 'Backdrop blur applied behind a translucent sheet.',
    },
  }),

  // Sidebar
  ...defineComponentTokens(meta('sidebar'), {
    width: { default: '16rem', description: 'Sidebar width when expanded.' },
    'width-icon': {
      default: '3rem',
      description: 'Sidebar width when collapsed to icon-only mode.',
    },
    'width-mobile': {
      default: '18rem',
      description: 'Sidebar width when shown as a mobile sheet.',
    },
  }),

  // Slider
  ...defineComponentTokens(meta('slider'), {
    'track-height': { default: '0.25rem', description: 'Slider track thickness.' },
    'thumb-size': { default: '1rem', description: 'Slider thumb diameter.' },
    radius: {
      default: '9999px',
      description: 'Track corner radius. Set lower for square / brutalist looks.',
      alias: 'slider',
    },
    'thumb-radius': {
      default: '9999px',
      description: 'Thumb corner radius. Lower for square thumbs.',
      alias: 'slider-thumb',
    },
    'tick-size': { default: '0.25rem', description: 'Tick dot diameter on the track.' },
    'thumb-border-width': {
      default: '2px',
      description: 'Thumb border width — the contrast halo between the thumb and the track.',
    },
    'thumb-shadow': {
      default: 'var(--shadow-raised)',
      description: 'Thumb drop shadow. Falls back to the global `--shadow-raised`.',
      alias: 'slider-thumb',
    },
    track: { default: 'var(--muted)', description: 'Unfilled portion of the track.' },
    fill: {
      default: 'var(--primary)',
      description: 'Filled portion of the track (left of the thumb).',
    },
    thumb: { default: 'var(--primary)', description: 'Thumb fill color.' },
    'thumb-border': {
      default: 'var(--background)',
      description: 'Thumb border (the halo separating thumb from track).',
    },
    tick: {
      default: 'var(--foreground)',
      description: 'Inactive tick dot color (over the unfilled track). Used with reduced opacity.',
    },
    'tick-active': {
      default: 'var(--primary-foreground)',
      description: 'Active tick dot color (over the filled track). Used with reduced opacity.',
    },
    label: { default: 'var(--muted-foreground)', description: 'Tick label text color.' },
    'label-active': {
      default: 'var(--foreground)',
      description: 'Tick label color when its value matches the current slider value.',
    },
  }),

  // Switch
  ...defineComponentTokens(meta('switch'), {
    'track-width': {
      default: '2.5rem',
      description: 'Switch track width. Fits two thumb diameters + padding + border.',
    },
    'track-height': {
      default: '1.5rem',
      description: 'Switch track height. Leaves room for thumb + padding + border.',
    },
  }),

  // Switch-thumb
  ...defineComponentTokens(meta('switch-thumb'), {
    size: { default: '1rem', description: 'Switch thumb diameter at the default size.' },
  }),

  // Table
  ...defineComponentTokens(meta('table'), {
    'header-bg': { default: 'var(--muted)', description: 'Background for table header rows.' },
    'row-bg': { default: 'var(--background)', description: 'Background for table body rows.' },
    'row-hover-bg': { default: 'var(--accent)', description: 'Background for hovered table rows.' },
  }),

  // Tabs
  ...defineComponentTokens(meta('tabs'), {
    'trigger-padding-x': {
      default: 'calc(var(--spacing) * 3)',
      description: 'Inline padding inside a tab trigger.',
    },
    'trigger-padding-y': {
      default: 'calc(var(--spacing) * 1.5)',
      description: 'Block padding inside a tab trigger.',
    },
  }),

  // Textarea
  ...defineComponentTokens(meta('textarea'), {
    radius: {
      default: 'var(--radius-control)',
      description: 'Textarea corner radius.',
      alias: 'textarea',
    },
  }),
];

const RAW_REGISTRY: readonly TokenSpec[] = [
  ...SCALARS,
  ...COLOR_ROLES,
  ...SEMANTIC_ROLES,
  ...COMPONENT_TOKENS,
  ...COMPONENT_EXPANSIONS,
];

/**
 * Full token registry. Every entry has its `type` filled in — either
 * explicitly authored or inferred from the name's suffix (see
 * `./infer.ts`). Downstream code can safely treat `type` as required.
 */
export const TOKEN_REGISTRY: readonly ResolvedTokenSpec[] = RAW_REGISTRY.map((token) => ({
  ...token,
  type: token.type ?? inferTokenType(token.name),
}));

/**
 * O(1) lookup by token name.
 */
export const TOKENS_BY_NAME: Readonly<Record<string, ResolvedTokenSpec>> = Object.fromEntries(
  TOKEN_REGISTRY.map((token) => [token.name, token])
);

/**
 * Filter tokens by their granular value type. Useful when generating
 * theme-editor UI that needs e.g. all radius tokens or all shadow tokens.
 */
export function tokensByType(type: ResolvedTokenSpec['type']): readonly ResolvedTokenSpec[] {
  return TOKEN_REGISTRY.filter((token) => token.type === type);
}
