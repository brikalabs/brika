/**
 * Per-component token-expansion helpers.
 *
 * The base registry hand-authors the irregular bits — color slots that
 * differ per component (button has filled/outline, card has just
 * container/label, dialog adds backdrop, …). The helpers below cover the
 * regular bits — every interactive control gets the same padding-x /
 * padding-y / height / gap surface; every focusable component gets the
 * same ring-width / ring-offset / ring-color / ring-style; etc.
 *
 * Helpers return arrays of `TokenSpec`. The registry concatenates them
 * with the hand-authored sections and feeds the result to the codegen.
 *
 * Default values are usually `var(...)` references that fall back through
 * Layer 1 roles (e.g. `--button-padding-x` falls back to `calc(var(--spacing) * 4)`),
 * so a theme that leaves a token blank gets sensible behaviour without
 * setting every entry.
 */

import { inferTokenType } from './infer';
import type { TailwindNamespace, TokenCategory, TokenSpec, TokenType } from './types';

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

/**
 * Geometry tokens — height, padding-x, padding-y, gap. Applies to most
 * interactive controls and many surfaces. The component-CSS rules under
 * `data-size="..."` override these per size; themes can override the
 * defaults too.
 */
export function geometryTokens(
  m: ComponentMeta,
  defaults: {
    readonly height?: string;
    readonly paddingX?: string;
    readonly paddingY?: string;
    readonly gap?: string;
  } = {}
): TokenSpec[] {
  const out: TokenSpec[] = [];
  if (defaults.height !== undefined) {
    out.push({
      name: `${m.name}-height`,
      layer: 'component',
      category: 'geometry',
      appliesTo: m.name,
      defaultLight: defaults.height,
      description: `Default ${m.name} height.`,
      themePath: `components.${m.themeKey}.height`,
    });
  }
  if (defaults.paddingX !== undefined) {
    out.push({
      name: `${m.name}-padding-x`,
      layer: 'component',
      category: 'geometry',
      appliesTo: m.name,
      defaultLight: defaults.paddingX,
      description: `Inline padding inside the ${m.name}.`,
      themePath: `components.${m.themeKey}.paddingX`,
    });
  }
  if (defaults.paddingY !== undefined) {
    out.push({
      name: `${m.name}-padding-y`,
      layer: 'component',
      category: 'geometry',
      appliesTo: m.name,
      defaultLight: defaults.paddingY,
      description: `Block padding inside the ${m.name}.`,
      themePath: `components.${m.themeKey}.paddingY`,
    });
  }
  if (defaults.gap !== undefined) {
    out.push({
      name: `${m.name}-gap`,
      layer: 'component',
      category: 'geometry',
      appliesTo: m.name,
      defaultLight: defaults.gap,
      description: `Gap between adjacent children inside the ${m.name}.`,
      themePath: `components.${m.themeKey}.gap`,
    });
  }
  return out;
}

/**
 * Border tokens — width, style. Border *color* is owned by the component-
 * specific color slot (e.g. `--button-outline-border`) so it isn't
 * generated here.
 */
export function borderTokens(m: ComponentMeta, width = '0px'): TokenSpec[] {
  return [
    {
      name: `${m.name}-border-width`,
      layer: 'component',
      category: 'border',
      appliesTo: m.name,
      defaultLight: width,
      description: `Border width on the ${m.name}. Set non-zero for outline-style variants.`,
      themePath: `components.${m.themeKey}.borderWidth`,
    },
    {
      name: `${m.name}-border-style`,
      layer: 'component',
      category: 'border',
      appliesTo: m.name,
      defaultLight: 'solid',
      description: `Border style on the ${m.name} (\`solid\`, \`dashed\`, \`double\`, \`none\`).`,
      themePath: `components.${m.themeKey}.borderStyle`,
    },
  ];
}

/**
 * Focus tokens — ring width, offset, color, style. Components either
 * inherit Layer-0 `--ring-*` defaults or themes override these
 * component-scoped keys to retune one component's focus indicator.
 */
export function focusTokens(m: ComponentMeta): TokenSpec[] {
  return [
    {
      name: `${m.name}-ring-width`,
      layer: 'component',
      category: 'focus',
      appliesTo: m.name,
      defaultLight: 'var(--ring-width)',
      description: `Focus ring width for ${m.name}. Falls back to the global \`--ring-width\`.`,
      themePath: `components.${m.themeKey}.ringWidth`,
    },
    {
      name: `${m.name}-ring-offset`,
      layer: 'component',
      category: 'focus',
      appliesTo: m.name,
      defaultLight: 'var(--ring-offset)',
      description: `Focus ring offset for ${m.name}. Falls back to the global \`--ring-offset\`.`,
      themePath: `components.${m.themeKey}.ringOffset`,
    },
    {
      name: `${m.name}-ring-color`,
      layer: 'component',
      category: 'focus',
      appliesTo: m.name,
      defaultLight: 'var(--ring)',
      description: `Focus ring color for ${m.name}. Falls back to the global \`--ring\`.`,
      themePath: `components.${m.themeKey}.ringColor`,
    },
    {
      name: `${m.name}-ring-style`,
      layer: 'component',
      category: 'focus',
      appliesTo: m.name,
      defaultLight: 'solid',
      description: `Focus ring style for ${m.name} (\`solid\`, \`dashed\`, \`double\`).`,
      themePath: `components.${m.themeKey}.ringStyle`,
    },
  ];
}

/**
 * Motion tokens — duration, easing. Falls back to the standard motion
 * channel when not set per-component.
 */
export function motionTokens(m: ComponentMeta): TokenSpec[] {
  return [
    {
      name: `${m.name}-duration`,
      layer: 'component',
      category: 'motion',
      appliesTo: m.name,
      defaultLight: 'var(--motion-standard-duration)',
      description: `Transition duration for ${m.name} state changes.`,
      themePath: `components.${m.themeKey}.duration`,
    },
    {
      name: `${m.name}-easing`,
      layer: 'component',
      category: 'motion',
      appliesTo: m.name,
      defaultLight: 'var(--motion-standard-easing)',
      description: `Transition easing for ${m.name} state changes.`,
      themePath: `components.${m.themeKey}.easing`,
    },
  ];
}

/**
 * Typography tokens — font-family, font-size, font-weight, line-height,
 * letter-spacing, text-transform. Themes use these to make a component
 * speak in a different voice (e.g. all-caps labels on Brutalist buttons).
 */
export function typographyTokens(
  m: ComponentMeta,
  defaults: {
    readonly fontFamily?: string;
    readonly fontSize?: string;
    readonly fontWeight?: string;
    readonly lineHeight?: string;
    readonly letterSpacing?: string;
    readonly textTransform?: string;
  } = {}
): TokenSpec[] {
  const out: TokenSpec[] = [];
  const push = (suffix: string, themeProp: string, fallback: string, description: string): void => {
    out.push({
      name: `${m.name}-${suffix}`,
      layer: 'component',
      category: 'typography',
      appliesTo: m.name,
      defaultLight: fallback,
      description,
      themePath: `components.${m.themeKey}.${themeProp}`,
    });
  };

  push(
    'font-family',
    'fontFamily',
    defaults.fontFamily ?? 'var(--font-sans)',
    `Typeface for ${m.name}.`
  );
  push(
    'font-size',
    'fontSize',
    defaults.fontSize ?? 'var(--text-body-md)',
    `Font size for ${m.name}.`
  );
  push('font-weight', 'fontWeight', defaults.fontWeight ?? '500', `Font weight for ${m.name}.`);
  push('line-height', 'lineHeight', defaults.lineHeight ?? '1.25', `Line height for ${m.name}.`);
  push(
    'letter-spacing',
    'letterSpacing',
    defaults.letterSpacing ?? '0',
    `Letter spacing for ${m.name}. Useful for caps labels.`
  );
  push(
    'text-transform',
    'textTransform',
    defaults.textTransform ?? 'none',
    `Text transform for ${m.name} (\`uppercase\`, \`lowercase\`, \`capitalize\`, \`none\`).`
  );

  return out;
}

/**
 * Hover / pressed / disabled state colors. Fallbacks rely on Tailwind's
 * `/<state>` opacity modifier, but themes can write explicit values.
 */
export function stateTokens(m: ComponentMeta): TokenSpec[] {
  return [
    {
      name: `${m.name}-hover-bg`,
      layer: 'component',
      category: 'state',
      appliesTo: m.name,
      defaultLight: 'transparent',
      description: `Background overlay applied to ${m.name} on hover.`,
      themePath: `components.${m.themeKey}.hoverBg`,
    },
    {
      name: `${m.name}-pressed-bg`,
      layer: 'component',
      category: 'state',
      appliesTo: m.name,
      defaultLight: 'transparent',
      description: `Background overlay applied to ${m.name} when pressed.`,
      themePath: `components.${m.themeKey}.pressedBg`,
    },
    {
      name: `${m.name}-disabled-opacity`,
      layer: 'component',
      category: 'state',
      appliesTo: m.name,
      defaultLight: 'var(--state-disabled-opacity)',
      description: `Opacity applied to ${m.name} when disabled.`,
      themePath: `components.${m.themeKey}.disabledOpacity`,
    },
  ];
}

/**
 * Convenience for the eight components below that share an identical
 * "interactive control" surface — Button, Badge, Tabs trigger, Select
 * trigger, Input, Textarea, etc. Combines border / focus / motion /
 * typography / state.
 *
 * `borderWidth` defaults to `'0px'` so non-bordered controls (filled
 * Buttons, Badges) don't grow a border by accident; pass `'1px'` for
 * always-bordered controls like Input.
 */
export function controlSurfaceTokens(
  m: ComponentMeta,
  geometryDefaults: Parameters<typeof geometryTokens>[1] = {},
  typographyDefaults: Parameters<typeof typographyTokens>[1] = {},
  borderWidth = '0px'
): TokenSpec[] {
  return [
    ...geometryTokens(m, geometryDefaults),
    ...borderTokens(m, borderWidth),
    ...focusTokens(m),
    ...motionTokens(m),
    ...typographyTokens(m, typographyDefaults),
    ...stateTokens(m),
  ];
}

export { meta };

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
 * Compact authoring shape for a single component-layer token.
 *
 *   default      — required CSS expression for `defaultLight`.
 *   description  — required one-sentence prose.
 *   defaultDark  — set when the dark-mode value differs.
 *   type         — override name-suffix inference.
 *   category     — override the type-derived category.
 *   namespace    — Tailwind namespace; auto-set for color/radius/shadow,
 *                  pass `'none'` (or omit) to suppress.
 *   alias        — utility alias when it differs from the var name.
 */
export interface ComponentTokenInput {
  readonly default: string;
  readonly description: string;
  readonly defaultDark?: string;
  readonly type?: TokenType;
  readonly category?: TokenCategory;
  readonly namespace?: TailwindNamespace;
  readonly alias?: string;
}

/**
 * Author component-layer tokens compactly. Each entry expands to a full
 * `TokenSpec` with `name`, `layer`, `appliesTo`, `type`, `category`,
 * `themePath`, and `tailwindNamespace` derived automatically.
 *
 * Replaces ~9 lines of structural boilerplate per token with a single
 * `key: { default, description }` line. The result is identical to a
 * hand-authored entry — just much less repetitive in the source.
 */
export function defineComponentTokens(
  m: ComponentMeta,
  entries: Readonly<Record<string, ComponentTokenInput>>
): TokenSpec[] {
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
