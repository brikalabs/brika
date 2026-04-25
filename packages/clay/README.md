# @brika/clay

Brika's React component library, token system, and first-party themes.

Clay provides the pressable raw material for every Brika surface: primitives,
components, tokens, and a curated set of built-in themes. Consumers depend on
`@brika/clay` and nothing else from the monorepo — no hub, no feature code.

## Token system

Clay's CSS tokens are organised in three layers, all driven by a single
hand-authored registry at `src/tokens/registry.ts`. Run
`pnpm --filter @brika/clay build:tokens` after edits to regenerate the
two CSS files in `src/styles/`:

- **Layer 0 — Scalars.** A handful of knobs (`--radius`, `--spacing`,
  `--font-sans`, `--motion-duration`, `--ring-width`, …). Themes set
  these to retune the whole library at once.
- **Layer 1 — Roles.** Semantic colors (`--primary`, `--background`,
  `--border`), semantic radii (`--radius-control`, `--radius-surface`),
  semantic shadows (`--shadow-overlay`, `--shadow-modal`), motion
  channels, state-layer opacities.
- **Layer 2 — Per-component.** Every component reads its own variables
  (`--button-padding-x`, `--card-shadow`, `--switch-thumb-size`) that
  fall back to a Layer 1 role. Themes override one component without
  touching the rest by writing to these.

The full reference is published at `/tokens` in clay-docs and exported
as TypeScript at `@brika/clay/tokens` (`TOKEN_REGISTRY`, `TokenSpec`).

## Themes

`ThemeConfig` is JSON-shaped, with optional sections per token category:

```json
{
  "id": "brutalist",
  "name": "Brutalist",
  "description": "Sharp corners, thick borders, monospace UI.",
  "accentSwatches": ["#000000", "#ffd400"],

  "colors":  { "light": { "primary": "#0a0a0a" }, "dark": { "primary": "#fafafa" } },
  "geometry": { "radius": "0px", "fontSans": "JetBrains Mono, monospace" },
  "borders":  { "width": "2px", "style": "solid" },
  "motion":   { "duration": "0ms" },
  "focus":    { "width": "3px", "offset": "3px" },

  "components": {
    "button": { "letterSpacing": "0.08em", "textTransform": "uppercase" },
    "card":   { "shadow": "none", "borderWidth": "2px" }
  }
}
```

Fifteen first-party themes ship today: the eleven colour-only palette
themes (default, ocean, forest, sunset, lavender, ruby, nord, solarized,
candy, dracula, mono) plus four showcase themes that exercise the full
token surface — **Brutalist** (geometry + borders + typography),
**Editorial** (typography + radii + motion), **Terminal** (monospace,
zero radius, dashed dividers), and **Skeuomorph** (heavy shadows + slow
motion). Pick any from the docs site's theme switcher to see how
deeply they retune the same components.

### Applying a theme

```ts
import { applyTheme, brutalist } from '@brika/clay/themes';

// Document-wide. Returns a cleanup function that removes the style tag.
const cleanup = applyTheme(brutalist);

// Toggle dark mode without re-applying:
document.documentElement.setAttribute('data-mode', 'dark');

cleanup();
```

`applyTheme` injects a single `<style id="clay-theme">` containing both
the `:root` light defaults and a `:is(.dark, [data-mode="dark"]):root`
block for dark overrides. Toggling the attribute afterwards costs
nothing — the dark block activates via CSS, no JS re-run.

For scoped previews use `themeToCssVars(theme, mode)` (returns a React
`style`-prop object). For SSR, embed `renderThemeStyleSheet(theme)` in
the document `<head>` to avoid FOUC; `applyTheme` reuses the existing
tag idempotently when the client mounts.

### Migrating from the colors-only schema

`ThemeConfig` previously required a non-optional `colors: { light, dark }`
field. The current schema makes `colors` optional and adds
`geometry`, `borders`, `motion`, `focus`, and `components` sections.
Existing themes work unchanged — JSON files in `src/themes/presets/*`
that only define `colors` continue to parse.

`applyTheme(theme, mode)` is now `applyTheme(theme)`. The mode is
inferred from `data-mode` at CSS resolution time, so the JS callsite
no longer carries it. `themeToCssVars(theme, mode)` is unchanged
(still useful for scoped previews where you want one specific mode's
flattened vars on a subtree).

## Layout

```
src/
  components/<name>/           # one folder per component
  primitives/                  # cn, useIsMobile — cross-cutting helpers
  styles/
    clay.css                   # entry point: @imports + utilities
    tokens-roles.css           # GENERATED — Layer 0 + 1
    tokens-components.css      # GENERATED — Layer 2 fallback chains + defaults
    components.css             # hand-authored token → CSS bridges
  themes/
    apply.ts                   # applyTheme, resetThemeVars, themeToCssVars
    flatten.ts                 # pure flattenTheme + renderThemeStyleSheet
    types.ts                   # ThemeConfig and friends
    presets/*.json             # 15 first-party themes
  tokens/
    registry.ts                # SOURCE OF TRUTH — every CSS variable
    types.ts                   # TokenSpec, TokenLayer, TokenCategory, ComponentName
    expand.ts                  # helpers that generate per-component token sets
scripts/
  build-tokens.ts              # codegen: registry → CSS
  build-tokens-emit.ts         # pure render functions (unit-tested)
```

## Arch rule

Nothing inside `packages/clay/src/` may import from `@brika/hub`,
`@brika/auth`, `apps/*`, or any feature directory.
