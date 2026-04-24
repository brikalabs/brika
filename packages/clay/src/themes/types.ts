/**
 * Shape of a Clay theme preset.
 *
 * `colors.light` and `colors.dark` each map token names (`primary`, `card`,
 * `border`, …) to hex strings. Matches the shadcn-style token scale Clay's
 * components consume; see apps/clay-docs/src/styles/global.css for the full
 * list of tokens.
 */
export interface ThemeConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly accentSwatches: readonly string[];
  readonly colors: {
    readonly light: Readonly<Record<string, string>>;
    readonly dark: Readonly<Record<string, string>>;
  };
}

export type ThemeMode = 'light' | 'dark';
