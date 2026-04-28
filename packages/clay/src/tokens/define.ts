/**
 * Single declarative entry point for registering a Clay component's
 * Layer-2 tokens. Component-author API is the `defineComponent` function
 * at the bottom; everything above it is the per-token-family expansion
 * machinery it composes from.
 *
 * Token names follow the `<name>-<slot>` convention. The `name` argument
 * becomes the kebab-case prefix on every emitted CSS variable
 * (`--<name>-radius`, `--<name>-padding-x`, …) and on the Tailwind theme
 * key (`components.<themeKey>.radius` in theme JSON).
 *
 * Default values are usually `var(...)` references that fall back through
 * Layer 1 roles (e.g. `--button-padding-x` falls back to
 * `calc(var(--spacing) * 4)`), so a theme that leaves a token blank gets
 * sensible behaviour without setting every entry.
 *
 * @example  Labeled interactive control (Button):
 *   defineComponent('button', {
 *     radius:  { default: 'var(--radius-control)', alias: 'button', description: 'Button corner radius.' },
 *     shadow:  { default: 'var(--shadow-surface)', alias: 'button', description: 'Resting elevation.' },
 *     surface: true,
 *     geometry:   { height: '2.25rem', paddingX: SPACING_4, paddingY: SPACING_2, gap: SPACING_2 },
 *     typography: { fontSize: 'var(--text-body-md)', fontWeight: '500' },
 *     slots: {
 *       'filled-container': { default: 'var(--primary)', description: 'Filled-variant background.' },
 *       'filled-label':     { default: 'var(--primary-foreground)', description: 'Filled-variant label.' },
 *     },
 *   });
 *
 * @example  Non-interactive surface (Card):
 *   defineComponent('card', {
 *     radius: { default: 'var(--radius-container)', alias: 'card', description: 'Card corner radius.' },
 *     shadow: { default: 'var(--shadow-raised)', alias: 'card', description: 'Card elevation.' },
 *     border: '1px',          // border-width + border-style tokens
 *     motion: true,           // duration + easing tokens
 *     backdropBlur: { default: '0px', description: 'Backdrop blur for translucent variants.' },
 *     geometry:   { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 },
 *     typography: { fontSize: 'var(--text-body-md)' },
 *     slots: {
 *       container: { default: 'var(--card)', description: 'Card background.' },
 *       label:     { default: 'var(--card-foreground)', description: 'Card text color.' },
 *     },
 *   });
 *
 * @example  Toggle without text (Switch — two namespaces):
 *   defineComponent('switch', {
 *     radius:  { default: '9999px', alias: 'switch', description: 'Track radius.' },
 *     surface: true,                     // border + focus + motion + state, no padding/typography
 *     slots: {
 *       'track-width':  { default: '2.5rem', description: 'Track width.' },
 *       'track-height': { default: '1.5rem', description: 'Track height.' },
 *     },
 *   });
 *   defineComponent('switch-thumb', {
 *     themeKey: 'switchThumb',
 *     radius:   { default: '9999px', alias: 'switch-thumb', description: 'Thumb radius.' },
 *     slots:    { size: { default: '1rem', description: 'Thumb diameter.' } },
 *   });
 */

import { inferTokenType } from './infer';
import type { TailwindNamespace, TokenCategory, TokenSpec, TokenType } from './types';

// ─── Component meta ──────────────────────────────────────────────────────────

interface ComponentMeta {
  /** Component name as it appears in the registry (kebab-case, matches CSS). */
  readonly name: string;
  /** camelCase identifier used in `themePath` (`switchThumb` for `switch-thumb`). */
  readonly themeKey: string;
}

function meta(name: string, themeKey?: string): ComponentMeta {
  return {
    name,
    themeKey: themeKey ?? name.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
  };
}

// ─── Token builder ───────────────────────────────────────────────────────────

/**
 * Build a single component-layer `TokenSpec`. `themeProp` is the camelCase
 * entry under `components.<themeKey>` in `ThemeConfig` JSON; `suffix` is the
 * kebab-case tail of the CSS-var name (e.g. `'padding-x'` → `--<comp>-padding-x`).
 */
function token(
  m: ComponentMeta,
  category: TokenCategory,
  suffix: string,
  themeProp: string,
  defaultLight: string,
  description: string
): TokenSpec {
  return {
    name: `${m.name}-${suffix}`,
    layer: 'component',
    category,
    appliesTo: m.name,
    defaultLight,
    description,
    themePath: `components.${m.themeKey}.${themeProp}`,
  };
}

// ─── Token families ──────────────────────────────────────────────────────────
//
// Each helper returns an array of `TokenSpec`s for a coherent slice of the
// component surface. `defineComponent` (below) opts in/out per family.

interface GeometryDefaults {
  readonly height?: string;
  readonly paddingX?: string;
  readonly paddingY?: string;
  readonly gap?: string;
}

function geometryTokens(m: ComponentMeta, defaults: GeometryDefaults = {}): TokenSpec[] {
  const out: TokenSpec[] = [];
  if (defaults.height !== undefined) {
    out.push(token(m, 'geometry', 'height', 'height', defaults.height, `Default ${m.name} height.`));
  }
  if (defaults.paddingX !== undefined) {
    out.push(token(m, 'geometry', 'padding-x', 'paddingX', defaults.paddingX, `Inline padding inside the ${m.name}.`));
  }
  if (defaults.paddingY !== undefined) {
    out.push(token(m, 'geometry', 'padding-y', 'paddingY', defaults.paddingY, `Block padding inside the ${m.name}.`));
  }
  if (defaults.gap !== undefined) {
    out.push(token(m, 'geometry', 'gap', 'gap', defaults.gap, `Gap between adjacent children inside the ${m.name}.`));
  }
  return out;
}

function borderTokens(m: ComponentMeta, width = '0px'): TokenSpec[] {
  return [
    token(m, 'border', 'border-width', 'borderWidth', width, `Border width on the ${m.name}. Set non-zero for outline-style variants.`),
    token(m, 'border', 'border-style', 'borderStyle', 'solid', `Border style on the ${m.name} (\`solid\`, \`dashed\`, \`double\`, \`none\`).`),
  ];
}

function motionTokens(m: ComponentMeta): TokenSpec[] {
  return [
    token(m, 'motion', 'duration', 'duration', 'var(--motion-standard-duration)', `Transition duration for ${m.name} state changes.`),
    token(m, 'motion', 'easing', 'easing', 'var(--motion-standard-easing)', `Transition easing for ${m.name} state changes.`),
  ];
}

interface TypographyDefaults {
  readonly fontFamily?: string;
  readonly fontSize?: string;
  readonly fontWeight?: string;
  readonly lineHeight?: string;
  readonly letterSpacing?: string;
  readonly textTransform?: string;
}

const TYPOGRAPHY_FIELDS: ReadonlyArray<{
  readonly suffix: string;
  readonly key: keyof TypographyDefaults;
  readonly fallback: string;
  readonly describe: (name: string) => string;
}> = [
  { suffix: 'font-family', key: 'fontFamily', fallback: 'var(--font-sans)', describe: (n) => `Typeface for ${n}.` },
  { suffix: 'font-size', key: 'fontSize', fallback: 'var(--text-body-md)', describe: (n) => `Font size for ${n}.` },
  { suffix: 'font-weight', key: 'fontWeight', fallback: '500', describe: (n) => `Font weight for ${n}.` },
  { suffix: 'line-height', key: 'lineHeight', fallback: '1.25', describe: (n) => `Line height for ${n}.` },
  { suffix: 'letter-spacing', key: 'letterSpacing', fallback: '0', describe: (n) => `Letter spacing for ${n}. Useful for caps labels.` },
  { suffix: 'text-transform', key: 'textTransform', fallback: 'none', describe: (n) => `Text transform for ${n} (\`uppercase\`, \`lowercase\`, \`capitalize\`, \`none\`).` },
];

function typographyTokens(m: ComponentMeta, defaults: TypographyDefaults = {}): TokenSpec[] {
  return TYPOGRAPHY_FIELDS.map((field) =>
    token(m, 'typography', field.suffix, field.key, defaults[field.key] ?? field.fallback, field.describe(m.name))
  );
}

// ─── Slot tokens (radius / shadow / backdrop-blur / arbitrary slots) ────────

const TYPE_TO_CATEGORY: Readonly<Record<TokenType, TokenCategory>> = {
  color: 'color',
  size: 'geometry',
  radius: 'geometry',
  'border-width': 'border',
  'border-style': 'border',
  shadow: 'elevation',
  duration: 'motion',
  easing: 'motion',
  'font-family': 'typography',
  'font-size': 'typography',
  'font-weight': 'typography',
  'line-height': 'typography',
  'letter-spacing': 'typography',
  'text-transform': 'typography',
  'corner-shape': 'geometry',
  opacity: 'state',
  blur: 'elevation',
};

const TYPE_TO_NAMESPACE: Partial<Record<TokenType, TailwindNamespace>> = {
  color: 'color',
  radius: 'radius',
  shadow: 'shadow',
};

/**
 * Compact authoring shape for a single component-layer token slot.
 *
 *   default      — required CSS expression for `defaultLight`.
 *   description  — required one-sentence prose, surfaced in the docs site.
 *   defaultDark  — set when the dark-mode value differs.
 *   type         — override the name-suffix-based type inference.
 *   category     — override the type-derived category.
 *   namespace    — Tailwind namespace; auto-set for color/radius/shadow,
 *                  pass `'none'` (or omit) to suppress.
 *   alias        — Tailwind utility short name (`rounded-<alias>` etc.).
 */
export interface SlotInput {
  readonly default: string;
  readonly description: string;
  readonly defaultDark?: string;
  readonly type?: TokenType;
  readonly category?: TokenCategory;
  readonly namespace?: TailwindNamespace;
  readonly alias?: string;
}

function slotTokens(m: ComponentMeta, entries: Readonly<Record<string, SlotInput>>): TokenSpec[] {
  return Object.entries(entries).map(([key, input]) => {
    const name = `${m.name}-${key}`;
    const type = input.type ?? inferTokenType(name);
    const category = input.category ?? TYPE_TO_CATEGORY[type];
    const namespace = input.namespace ?? TYPE_TO_NAMESPACE[type];
    const themeProp = key.replaceAll(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    return {
      name,
      layer: 'component',
      appliesTo: m.name,
      type,
      category,
      defaultLight: input.default,
      defaultDark: input.defaultDark,
      description: input.description,
      themePath: `components.${m.themeKey}.${themeProp}`,
      tailwindNamespace: namespace,
      utilityAlias: input.alias,
    };
  });
}

// ─── Public authoring API ───────────────────────────────────────────────────

/**
 * Declarative description of a single Clay component's tokens.
 *
 * Pass exactly one of these to `defineComponent`. Every option is opt-in;
 * the function only registers the families you list.
 */
export interface ComponentDefinition {
  /**
   * camelCase theme key used in `ThemeConfig` JSON
   * (`components.<themeKey>.<prop>`). Auto-derived from the kebab-case
   * `name` if omitted (e.g. `'switch-thumb'` → `'switchThumb'`).
   */
  readonly themeKey?: string;

  // ─── Single-slot conventional tokens ─────────────────────────────
  /** Corner radius. Pair with the matching `rounded-<alias>` Tailwind utility. */
  readonly radius?: SlotInput;
  /** Resting drop shadow / elevation. */
  readonly shadow?: SlotInput;
  /** Backdrop-filter blur radius — for translucent surfaces (Card, Dialog, Popover, Sheet). */
  readonly backdropBlur?: SlotInput;

  // ─── Multi-token bundles ────────────────────────────────────────
  /**
   * Shortcut for `border + motion` — every interactive control surface
   * needs these. Pass `true` for a 0px resting border, or
   * `{ borderWidth: '1px' }` for a visible border on rest. When set,
   * the individual `border` / `motion` flags below are ignored.
   */
  readonly surface?: boolean | { readonly borderWidth: string };

  /**
   * Granular alternative to `surface` for non-interactive surfaces
   * (Card, Dialog content, Tooltip). Pass `true` for a `'0px'` resting
   * width or a string to set it explicitly.
   */
  readonly border?: boolean | string;
  /** Adds `--<name>-{duration,easing}`. */
  readonly motion?: boolean;

  // ─── Sizing / typography (opt-in field-by-field) ────────────────
  /** Sizing tokens — `height`, `paddingX`, `paddingY`, `gap`. Only set fields become tokens. */
  readonly geometry?: GeometryDefaults;
  /**
   * Text tokens — `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`,
   * `letterSpacing`, `textTransform`. Pass an object (even an empty one)
   * to opt into the full typography family; omit to skip every typography
   * token (e.g. Switch and Checkbox have no text inside).
   */
  readonly typography?: TypographyDefaults;

  // ─── Arbitrary named slots ──────────────────────────────────────
  /**
   * Component-specific tokens — semantic colors (`filled-container`),
   * custom sizes (`track-width`, `thumb-size`), anything that doesn't
   * fit one of the conventional families above.
   */
  readonly slots?: Readonly<Record<string, SlotInput>>;
}

function collectSlots(def: ComponentDefinition): Record<string, SlotInput> {
  const merged: Record<string, SlotInput> = { ...def.slots };
  if (def.radius) {
    merged.radius = def.radius;
  }
  if (def.shadow) {
    merged.shadow = def.shadow;
  }
  if (def.backdropBlur) {
    merged['backdrop-blur'] = def.backdropBlur;
  }
  return merged;
}

/**
 * Resolve `border` opt-in into a width string, or `null` if absent:
 *   `'1px'` → `'1px'` · `true` → `'0px'` · `false`/`undefined` → `null`
 */
function resolveBorderWidth(value: boolean | string | undefined): string | null {
  if (value === undefined || value === false) {
    return null;
  }
  return typeof value === 'string' ? value : '0px';
}

/**
 * Resolve the surface bundle (`surface` shortcut, plus the granular
 * `border` / `motion` flags) into the matching token sets.
 * `surface` wins over the granular flags.
 */
function bundleTokens(m: ComponentMeta, def: ComponentDefinition): TokenSpec[] {
  if (def.surface) {
    const surfaceWidth = typeof def.surface === 'object' ? def.surface.borderWidth : '0px';
    return [...borderTokens(m, surfaceWidth), ...motionTokens(m)];
  }
  const out: TokenSpec[] = [];
  const borderWidth = resolveBorderWidth(def.border);
  if (borderWidth !== null) {
    out.push(...borderTokens(m, borderWidth));
  }
  if (def.motion) {
    out.push(...motionTokens(m));
  }
  return out;
}

/**
 * Build every Layer-2 CSS-variable token a component needs, in one
 * declarative call. Pure — no side effects. The component's `tokens.ts`
 * exports the result; `tokens/components.ts` aggregates them.
 */
export function defineComponent(name: string, def: ComponentDefinition): readonly TokenSpec[] {
  const m = meta(name, def.themeKey);
  const slots = collectSlots(def);
  return [
    ...(Object.keys(slots).length > 0 ? slotTokens(m, slots) : []),
    ...bundleTokens(m, def),
    ...(def.geometry ? geometryTokens(m, def.geometry) : []),
    ...(def.typography ? typographyTokens(m, def.typography) : []),
  ];
}
