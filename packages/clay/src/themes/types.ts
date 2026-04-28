/**
 * Shape of a Clay theme preset.
 *
 * A theme is plain data — JSON in `./presets/*.json` for first-party themes,
 * or a literal `ThemeConfig` from consumer code. `applyTheme(theme, mode)`
 * (in `./apply.ts`) injects a `<style>` tag with `:root` and dark-mode rules
 * derived from the theme. `themeToCssVars(theme, mode)` returns the same
 * CSS variables as a React-style object for scoped overrides.
 *
 * Every section is optional. The smallest valid theme provides only the
 * required identification fields; the existing 11 first-party themes only
 * fill in `colors`. New themes can opt into geometry, borders, typography,
 * motion, focus, and per-component overrides to fully re-skin the library.
 *
 * Token naming conventions:
 *   colors.{light,dark}.<token>  — kebab-case CSS var name, e.g. `card-foreground`.
 *   geometry.<prop>              — camelCase, e.g. `fontSans`.
 *   borders.<prop>               — camelCase.
 *   motion.<prop>                — camelCase.
 *   focus.<prop>                 — camelCase.
 *   components.<name>.<prop>     — `<name>` is kebab-case (matches CSS),
 *                                  `<prop>` is camelCase. The walker emits
 *                                  `--<name>-<kebab(prop)>` as the CSS var.
 */

/** A flat dictionary of CSS variable names (without leading `--`) → values. */
export type TokenMap = Readonly<Record<string, string>>;

export interface ThemeColors {
  readonly light?: TokenMap;
  readonly dark?: TokenMap;
}

export interface ThemeGeometry {
  readonly radius?: string;
  readonly spacing?: string;
  readonly textBase?: string;
  readonly fontSans?: string;
  readonly fontMono?: string;
  readonly backdropBlur?: string;
}

export interface ThemeBorders {
  readonly width?: string;
  /**
   * CSS `border-style` value. Clay visually verifies `solid`, `dashed`,
   * `double`, and `none`; other CSS-spec values pass through untouched.
   */
  readonly style?: string;
}

export interface ThemeMotion {
  readonly duration?: string;
  readonly easing?: string;
}

export interface ThemeFocus {
  readonly width?: string;
  readonly offset?: string;
}

/**
 * Per-component override map. Open-ended on prop names — the registry is
 * the authoritative list of valid keys; expressing that as a TS literal
 * union would force a type-update on every new component token, with
 * little real safety win. Theme JSON is validated at runtime by the
 * flatten / apply pipeline, which silently skips unknown keys.
 */
export type ComponentTokenMap = Readonly<Record<string, string>>;

/**
 * Visual flourishes a theme can opt into. Each is a CSS-only effect wired
 * up by `@brika/clay/styles` via `html[data-effects~="<name>"]` selectors.
 *
 * - `scanlines` — repeating horizontal CRT-style lines, blended over the page
 * - `glow`      — soft `text-shadow` on headings and primary buttons
 * - `noise`     — SVG turbulence grain overlay (heavier)
 * - `paper`     — subtle parchment grain (lighter than `noise`)
 * - `halftone`  — radial-gradient dot pattern overlay
 * - `vignette`  — corner-darkening radial gradient
 * - `flicker`   — slow opacity flicker, auto-disabled by `prefers-reduced-motion`
 */
export type ThemeEffect =
  | 'scanlines'
  | 'glow'
  | 'noise'
  | 'paper'
  | 'halftone'
  | 'vignette'
  | 'flicker';

export interface ThemeConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly accentSwatches: readonly string[];

  readonly colors?: ThemeColors;
  readonly geometry?: ThemeGeometry;
  readonly borders?: ThemeBorders;
  readonly motion?: ThemeMotion;
  readonly focus?: ThemeFocus;

  readonly components?: Readonly<Record<string, ComponentTokenMap>>;
  /**
   * See {@link ThemeEffect} for the recognised values. Stays typed as
   * `string[]` so JSON-imported preset arrays remain assignable; the CSS
   * silently no-ops on unknown effect names.
   */
  readonly effects?: readonly string[];
}

export type ThemeMode = 'light' | 'dark';
