/**
 * Theme generator — derives a complete ThemeConfig from a single primary color.
 *
 * Uses Clay's TOKEN_REGISTRY as the source of truth for which color tokens
 * exist, then fills each one algorithmically via HSL derivation from the
 * primary hue. Tokens not explicitly handled fall back to the registry
 * default so the output is always a valid, renderable theme.
 */

import { TOKEN_REGISTRY } from '@brika/clay/tokens';
import {
  bestForeground,
  type HSL,
  hslToRgb,
  parseHex,
  rgbToHex,
  rgbToHsl,
} from './color-utils';
import { THEME_CONFIG_VERSION, type ThemeColors, type ThemeConfig } from './types';

export type GenerateStyle = 'balanced' | 'vibrant' | 'tinted';

export interface GenerateOptions {
  /** Primary brand color as a hex string (e.g. "#3b82f6"). */
  primary: string;
  /** Base radius in rem. Default 0.75. */
  radius?: number;
  /** Controls how much the primary hue bleeds into neutral surfaces. */
  style?: GenerateStyle;
  name?: string;
}

function hsl(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  return rgbToHex(hslToRgb({ h: hh, s: Math.min(1, Math.max(0, s)), l: Math.min(1, Math.max(0, l)) }));
}

/** Clamp hue angle to 0-360. */
function hue(base: number, offset = 0): number {
  return ((base + offset) % 360 + 360) % 360;
}

// ─── Fixed semantic hues ───────────────────────────────────────────────────────

const HUE_SUCCESS = 135;
const HUE_WARNING = 70;
const HUE_INFO = 225;
const HUE_DESTRUCTIVE = 22;

// ─── Per-style tint strengths ──────────────────────────────────────────────────

const TINT: Record<GenerateStyle, { neutral: number; surface: number }> = {
  balanced:   { neutral: 0.06, surface: 0.03 },
  vibrant:    { neutral: 0.12, surface: 0.06 },
  tinted:     { neutral: 0.2, surface: 0.1 },
};

// ─── Mode configuration ───────────────────────────────────────────────────────

interface ContainerSlot { sMult: number; l: number }
interface SemanticSlot  { s: number; l: number }

interface ModeConfig {
  primL: { min: number; max: number; shift: number; sMax: number; accentMin: number };
  accentMod: number;
  surfL: { bg: number; card: number; popover: number };
  neutralL: {
    fg: number; cardFg: number; secondary: number; secondaryFg: number;
    muted: number; mutedFg: number; border: number; statusIdle: number;
    sidebarFg: number; sidebarAccentFg: number;
  };
  semantic: {
    s:  readonly [number, number, number, number];
    l:  readonly [number, number, number, number];
    fg: readonly [string, string, string, string];
  };
  data: { s: number; l: number };
  sidebar: { useNeutral: boolean; bgL: number; accentL: number; borderL: number };
  outline: { base: number; variant: number };
  containers: {
    primary: ContainerSlot; onPrimary: ContainerSlot;
    secondary: ContainerSlot; onSecondary: ContainerSlot;
    accent: ContainerSlot; onAccent: ContainerSlot;
    success: SemanticSlot; onSuccess: SemanticSlot;
    warning: SemanticSlot; onWarning: SemanticSlot;
    info:    SemanticSlot; onInfo:    SemanticSlot;
    destruct: SemanticSlot; onDestruct: SemanticSlot;
  };
  surfaceScale: readonly [number, number, number, number, number, number, number];
}

const LIGHT: ModeConfig = {
  primL:    { min: 0.35, max: 0.62, shift: 0,    sMax: 0.95, accentMin: 0.38 },
  accentMod: 0.9,
  surfL:    { bg: 0.99, card: 1, popover: 0.99 },
  neutralL: { fg: 0.1, cardFg: 0.1, secondary: 0.94, secondaryFg: 0.12, muted: 0.96, mutedFg: 0.45, border: 0.88, statusIdle: 0.62, sidebarFg: 0.1, sidebarAccentFg: 0.12 },
  semantic: { s: [0.6, 0.82, 0.75, 0.82], l: [0.42, 0.47, 0.5, 0.52], fg: ['#ffffff', '#0a0a0a', '#ffffff', '#ffffff'] },
  data:     { s: 0.7, l: 0.5 },
  sidebar:  { useNeutral: true,  bgL: 0.97, accentL: 0.92, borderL: 0.88 },
  outline:  { base: 0.88, variant: 0.92 },
  containers: {
    primary:   { sMult: 0.5,  l: 0.9  }, onPrimary:   { sMult: 0.8, l: 0.2 },
    secondary: { sMult: 0.4,  l: 0.92 }, onSecondary: { sMult: 0.8, l: 0.2 },
    accent:    { sMult: 0.45, l: 0.91 }, onAccent:    { sMult: 0.8, l: 0.2 },
    success:   { s: 0.55, l: 0.9  },     onSuccess:   { s: 0.6, l: 0.18 },
    warning:   { s: 0.7,  l: 0.9  },     onWarning:   { s: 0.8, l: 0.18 },
    info:      { s: 0.65, l: 0.9  },     onInfo:      { s: 0.7, l: 0.18 },
    destruct:  { s: 0.7,  l: 0.9  },     onDestruct:  { s: 0.8, l: 0.18 },
  },
  surfaceScale: [0.93, 0.99, 1, 0.97, 0.95, 0.92, 0.9],
};

const DARK: ModeConfig = {
  primL:    { min: 0.55, max: 0.78, shift: 0.15, sMax: 0.9, accentMin: 0.55 },
  accentMod: 0.85,
  surfL:    { bg: 0.07, card: 0.11, popover: 0.09 },
  neutralL: { fg: 0.93, cardFg: 0.92, secondary: 0.17, secondaryFg: 0.88, muted: 0.15, mutedFg: 0.58, border: 0.22, statusIdle: 0.5, sidebarFg: 0.9, sidebarAccentFg: 0.88 },
  semantic: { s: [0.6, 0.8, 0.75, 0.8], l: [0.65, 0.62, 0.68, 0.68], fg: ['#0a0a0a', '#0a0a0a', '#0a0a0a', '#0a0a0a'] },
  data:     { s: 0.65, l: 0.65 },
  sidebar:  { useNeutral: false, bgL: 0.09, accentL: 0.18, borderL: 0.2 },
  outline:  { base: 0.22, variant: 0.18 },
  containers: {
    primary:   { sMult: 0.4,  l: 0.22 }, onPrimary:   { sMult: 0.7,  l: 0.88 },
    secondary: { sMult: 0.35, l: 0.2  }, onSecondary: { sMult: 0.65, l: 0.88 },
    accent:    { sMult: 0.38, l: 0.21 }, onAccent:    { sMult: 0.65, l: 0.88 },
    success:   { s: 0.5, l: 0.22 },      onSuccess:   { s: 0.6, l: 0.88 },
    warning:   { s: 0.6, l: 0.2  },      onWarning:   { s: 0.75, l: 0.88 },
    info:      { s: 0.55, l: 0.22 },     onInfo:      { s: 0.65, l: 0.88 },
    destruct:  { s: 0.6, l: 0.22 },      onDestruct:  { s: 0.75, l: 0.88 },
  },
  surfaceScale: [0.05, 0.18, 0.05, 0.09, 0.12, 0.17, 0.22],
};

// ─── Core derivation ──────────────────────────────────────────────────────────

function derivePalette(p: HSL, style: GenerateStyle, cfg: ModeConfig): ThemeColors {
  const { h, s } = p;
  const t = TINT[style];

  const primL  = Math.max(cfg.primL.min, Math.min(cfg.primL.max, p.l + cfg.primL.shift));
  const primS  = Math.max(0.5, Math.min(cfg.primL.sMax, s));
  const primary   = hsl(h, primS, primL);
  const primaryFg = bestForeground(primary, ['#ffffff', '#0a0a0a']);

  const ah      = hue(h, 25);
  const accentL = Math.max(cfg.primL.accentMin, Math.min(cfg.primL.max, p.l + cfg.primL.shift));
  const accent    = hsl(ah, primS * cfg.accentMod, accentL);
  const accentFg  = bestForeground(accent, ['#ffffff', '#0a0a0a']);

  const n  = (l: number, extraS = 0) => hsl(h, t.neutral + extraS, l);
  const sv = (l: number) => hsl(h, t.surface, l);

  const [successS, warningS, infoS, destructS] = cfg.semantic.s;
  const [successL, warningL, infoL, destructL] = cfg.semantic.l;
  const [successFg, warningFg, infoFg, destructiveFg] = cfg.semantic.fg;
  const success     = hsl(HUE_SUCCESS,     successS, successL);
  const warning     = hsl(HUE_WARNING,     warningS, warningL);
  const info        = hsl(HUE_INFO,        infoS,    infoL);
  const destructive = hsl(HUE_DESTRUCTIVE, destructS, destructL);

  const dataColor  = (offset: number) => hsl(hue(h, offset), cfg.data.s, cfg.data.l);
  const sidebarBg  = cfg.sidebar.useNeutral ? n(cfg.sidebar.bgL) : sv(cfg.sidebar.bgL);
  const c          = cfg.containers;
  const [dimL, brightL, lowestL, lowL, midL, highL, highestL] = cfg.surfaceScale;

  return {
    background:             sv(cfg.surfL.bg),
    foreground:             n(cfg.neutralL.fg),
    card:                   sv(cfg.surfL.card),
    'card-foreground':      n(cfg.neutralL.cardFg),
    popover:                sv(cfg.surfL.popover),
    'popover-foreground':   n(cfg.neutralL.cardFg),

    primary,
    'primary-foreground':   primaryFg,
    secondary:              n(cfg.neutralL.secondary, 0.02),
    'secondary-foreground': n(cfg.neutralL.secondaryFg),
    accent,
    'accent-foreground':    accentFg,

    muted:              n(cfg.neutralL.muted),
    'muted-foreground': n(cfg.neutralL.mutedFg),
    border:             n(cfg.neutralL.border),
    input:              n(cfg.neutralL.border),
    ring:               primary,

    success,
    'success-foreground':     successFg,
    warning,
    'warning-foreground':     warningFg,
    info,
    'info-foreground':        infoFg,
    destructive,
    'destructive-foreground': destructiveFg,

    'status-idle':      n(cfg.neutralL.statusIdle),
    'status-running':   primary,
    'status-completed': success,
    'status-error':     destructive,

    'data-1': dataColor(0),
    'data-2': dataColor(45),
    'data-3': dataColor(90),
    'data-4': dataColor(135),
    'data-5': dataColor(180),
    'data-6': dataColor(225),
    'data-7': dataColor(270),
    'data-8': dataColor(315),

    sidebar:                      sidebarBg,
    'sidebar-foreground':         n(cfg.neutralL.sidebarFg),
    'sidebar-primary':            primary,
    'sidebar-primary-foreground': primaryFg,
    'sidebar-accent':             n(cfg.sidebar.accentL),
    'sidebar-accent-foreground':  n(cfg.neutralL.sidebarAccentFg),
    'sidebar-border':             n(cfg.sidebar.borderL),
    'sidebar-ring':               primary,

    outline:           n(cfg.outline.base),
    'outline-variant': n(cfg.outline.variant),

    'primary-container':        hsl(h, primS * c.primary.sMult,   c.primary.l),
    'on-primary-container':     hsl(h, primS * c.onPrimary.sMult, c.onPrimary.l),
    'secondary-container':      hsl(ah, primS * c.secondary.sMult,   c.secondary.l),
    'on-secondary-container':   hsl(ah, primS * c.onSecondary.sMult, c.onSecondary.l),
    'accent-container':         hsl(ah, primS * c.accent.sMult,   c.accent.l),
    'on-accent-container':      hsl(ah, primS * c.onAccent.sMult, c.onAccent.l),
    'success-container':        hsl(HUE_SUCCESS,     c.success.s,   c.success.l),
    'on-success-container':     hsl(HUE_SUCCESS,     c.onSuccess.s, c.onSuccess.l),
    'warning-container':        hsl(HUE_WARNING,     c.warning.s,   c.warning.l),
    'on-warning-container':     hsl(HUE_WARNING,     c.onWarning.s, c.onWarning.l),
    'info-container':           hsl(HUE_INFO,        c.info.s,      c.info.l),
    'on-info-container':        hsl(HUE_INFO,        c.onInfo.s,    c.onInfo.l),
    'destructive-container':    hsl(HUE_DESTRUCTIVE, c.destruct.s,  c.destruct.l),
    'on-destructive-container': hsl(HUE_DESTRUCTIVE, c.onDestruct.s, c.onDestruct.l),

    'surface-dim':               sv(dimL),
    'surface-bright':            sv(brightL),
    'surface-container-lowest':  sv(lowestL),
    'surface-container-low':     sv(lowL),
    'surface-container':         sv(midL),
    'surface-container-high':    sv(highL),
    'surface-container-highest': sv(highestL),
  };
}

// ─── Registry-driven completion ───────────────────────────────────────────────

/**
 * Fill any role color token not explicitly produced by `deriveLight/Dark`
 * with its TOKEN_REGISTRY default, so the output is always complete.
 */
function fillRegistryDefaults(
  colors: ThemeColors,
  mode: 'light' | 'dark'
): ThemeColors {
  const out: ThemeColors = { ...colors };
  for (const token of TOKEN_REGISTRY) {
    if (token.type !== 'color' || token.layer !== 'role') continue;
    if (out[token.name] !== undefined) continue;
    const fallback = mode === 'dark' && token.defaultDark ? token.defaultDark : token.defaultLight;
    if (fallback && !fallback.startsWith('var(')) {
      out[token.name] = fallback;
    }
  }
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateTheme(options: GenerateOptions): ThemeConfig {
  const { primary, radius = 0.75, style = 'balanced', name = 'My Theme' } = options;

  const rgb = parseHex(primary);
  if (!rgb) {
    throw new Error(`generateTheme: invalid primary color "${primary}"`);
  }

  const p = rgbToHsl(rgb);
  const light = fillRegistryDefaults(derivePalette(p, style, LIGHT), 'light');
  const dark  = fillRegistryDefaults(derivePalette(p, style, DARK), 'dark');

  const now = Date.now();
  return {
    version: THEME_CONFIG_VERSION,
    id: `custom-${now.toString(36)}`,
    name,
    createdAt: now,
    updatedAt: now,
    radius,
    corners: 'round',
    fonts: {
      sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
      mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    },
    colors: { light, dark },
  };
}

/** Accent swatches for the generator preview (8 data-viz colors). */
export function accentSwatchesFor(primary: string): readonly string[] {
  const rgb = parseHex(primary);
  if (!rgb) return [];
  const { h } = rgbToHsl(rgb);
  return Array.from({ length: 8 }, (_, i) => {
    const offset = (i * 45) % 360;
    return rgbToHex(hslToRgb({ h: hue(h, offset), s: 0.7, l: 0.5 }));
  });
}
