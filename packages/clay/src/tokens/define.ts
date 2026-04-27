/**
 * Single declarative entry point for registering a Clay component's
 * Layer-2 tokens. Replaces the old `buildMeta` + `registerTokens` +
 * stack-of-helpers pattern with one self-documenting function call.
 *
 * Behind the scenes `defineComponent` still composes the per-family
 * helpers in `./expand.ts` (`borderTokens`, `focusTokens`, etc.) — those
 * remain the source of truth for what each token category looks like.
 * `defineComponent` is just the ergonomic facade.
 *
 * Token names follow the `<name>-<slot>` convention. The `name` argument
 * becomes the kebab-case prefix on every emitted CSS variable
 * (`--<name>-radius`, `--<name>-padding-x`, …) and on the Tailwind theme
 * key (`components.<themeKey>.radius` in theme JSON).
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

import { registerTokens } from './component-registry';
import {
  borderTokens,
  type ComponentTokenInput,
  defineComponentTokens,
  focusTokens,
  geometryTokens,
  meta as buildMeta,
  motionTokens,
  stateTokens,
  typographyTokens,
} from './expand';
import type { TokenSpec } from './types';

/**
 * Shape of every named token slot.
 *
 *   default      — required CSS expression for `defaultLight`.
 *   description  — required one-sentence prose, surfaced in the docs site.
 *   defaultDark  — set when the dark-mode value differs.
 *   type         — override the name-suffix-based type inference.
 *   category     — override the type-derived category (e.g. group `ring-*`
 *                  tokens under `focus` instead of `border`).
 *   namespace    — Tailwind namespace; auto-set for color/radius/shadow,
 *                  pass `'none'` (or omit) to suppress.
 *   alias        — Tailwind utility short name (`rounded-<alias>` etc.).
 */
export type SlotInput = ComponentTokenInput;

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
  /**
   * Corner radius. Pair with the matching `rounded-<alias>` Tailwind
   * utility (`alias` defaults to the full token name; pass an explicit
   * one to shorten it).
   */
  readonly radius?: SlotInput;
  /** Resting drop shadow / elevation. */
  readonly shadow?: SlotInput;
  /** Backdrop-filter blur radius — for translucent surfaces (Card, Dialog, Popover, Sheet). */
  readonly backdropBlur?: SlotInput;

  // ─── Multi-token bundles ────────────────────────────────────────
  /**
   * Shortcut for `border + focus + motion + state` — every focusable
   * interactive control gets these. Pass `true` for a 0px resting border,
   * or `{ borderWidth: '1px' }` to opt into a visible border on rest.
   *
   * When set, the individual `border` / `focus` / `motion` / `state`
   * flags below are ignored.
   */
  readonly surface?: boolean | { readonly borderWidth: string };

  /**
   * Granular alternative to `surface` for non-interactive surfaces
   * (Card, Dialog content, Tooltip). Pass `true` for a `'0px'` resting
   * width or a string to set it explicitly.
   */
  readonly border?: boolean | string;
  /** Adds `--<name>-ring-{width,offset,color,style}`. */
  readonly focus?: boolean;
  /** Adds `--<name>-{duration,easing}`. */
  readonly motion?: boolean;
  /** Adds `--<name>-{hover-bg,pressed-bg,disabled-opacity}`. */
  readonly state?: boolean;

  // ─── Sizing / typography (opt-in field-by-field) ────────────────
  /**
   * Sizing tokens — `height`, `paddingX`, `paddingY`, `gap`. Only the
   * fields you pass become tokens; omit a field to skip it.
   */
  readonly geometry?: Parameters<typeof geometryTokens>[1];
  /**
   * Text tokens — `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`,
   * `letterSpacing`, `textTransform`. Pass an object (even an empty one)
   * to opt into the full typography family; omit to skip every typography
   * token (e.g. Switch and Checkbox have no text inside).
   */
  readonly typography?: Parameters<typeof typographyTokens>[1];

  // ─── Arbitrary named slots ──────────────────────────────────────
  /**
   * Component-specific tokens — semantic colors (`filled-container`),
   * custom sizes (`track-width`, `thumb-size`), anything that doesn't
   * fit one of the conventional families above.
   */
  readonly slots?: Readonly<Record<string, SlotInput>>;
}

const BACKDROP_BLUR_KEY = 'backdrop-blur';

/**
 * Register every Layer-2 CSS-variable token a component needs, in one
 * declarative call.
 *
 * Side effects: pushes the produced tokens into the module-level registry
 * exposed via `getRegisteredTokens()`. Returns the same array so callers
 * (and tests) can inspect what was registered without going through the
 * global registry.
 *
 * @param name  Kebab-case component name. Becomes the prefix on every
 *              emitted CSS variable (`--<name>-radius`, …).
 * @param def   See `ComponentDefinition` for the full option list.
 * @returns     Frozen array of the `TokenSpec`s that were registered.
 */
export function defineComponent(
  name: string,
  def: ComponentDefinition
): readonly TokenSpec[] {
  const m = buildMeta(name, def.themeKey);
  const tokens: TokenSpec[] = [];

  // 1. Single-slot conventional tokens + arbitrary slots all flow into
  //    one defineComponentTokens call so they share validation + Tailwind
  //    namespace inference.
  const merged: Record<string, ComponentTokenInput> = { ...def.slots };
  if (def.radius) merged.radius = def.radius;
  if (def.shadow) merged.shadow = def.shadow;
  if (def.backdropBlur) merged[BACKDROP_BLUR_KEY] = def.backdropBlur;
  if (Object.keys(merged).length > 0) {
    tokens.push(...defineComponentTokens(m, merged));
  }

  // 2. Surface bundle = border + focus + motion + state. When set, the
  //    individual flags below are ignored to keep the mental model clean
  //    (you opted into the bundle).
  if (def.surface) {
    const borderWidth = typeof def.surface === 'object' ? def.surface.borderWidth : '0px';
    tokens.push(
      ...borderTokens(m, borderWidth),
      ...focusTokens(m),
      ...motionTokens(m),
      ...stateTokens(m)
    );
  } else {
    if (def.border !== undefined && def.border !== false) {
      const borderWidth = typeof def.border === 'string' ? def.border : '0px';
      tokens.push(...borderTokens(m, borderWidth));
    }
    if (def.focus) tokens.push(...focusTokens(m));
    if (def.motion) tokens.push(...motionTokens(m));
    if (def.state) tokens.push(...stateTokens(m));
  }

  // 3. Sizing + typography opt-ins.
  if (def.geometry) tokens.push(...geometryTokens(m, def.geometry));
  if (def.typography) tokens.push(...typographyTokens(m, def.typography));

  registerTokens(tokens);
  return tokens;
}
