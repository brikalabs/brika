# @brika/clay

Brika's React component library, token system, and first-party themes.

Clay provides the pressable raw material for every Brika surface:
primitives, components, tokens, and a curated set of built-in themes.
The package depends only on React 19 and Tailwind v4 — no other Brika
packages, no monorepo glue.

**Full docs and live demos:** <https://clay.brika.dev>

## Installation

```bash
npm install @brika/clay
# or
bun add @brika/clay
```

Peer requirements:

- `react` ^19
- `react-dom` ^19
- `tailwindcss` ^4

## Quick start

Wire Tailwind v4 in your app's CSS entry point. The plugin contributes
all of Clay's tokens, dark-mode overrides, and per-component utilities:

```css
@import "tailwindcss";
@plugin "@brika/clay/tailwind";
@import "@brika/clay/styles";
```

Then import components from their granular paths for best
tree-shaking — or from the barrel for convenience:

```tsx
import { Button } from "@brika/clay/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@brika/clay/components/card";

export function Example() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hello, Clay</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>Click me</Button>
      </CardContent>
    </Card>
  );
}
```

## Public entry points

| Import path | Contents |
|---|---|
| `@brika/clay` | Barrel — every component + primitive |
| `@brika/clay/components/<name>` | Single component (e.g. `button`, `dialog`, `tabs`) |
| `@brika/clay/primitives` | `cn`, `cssVars`, `useIsMobile` |
| `@brika/clay/themes` | `applyTheme`, `ThemeScope`, all 17 preset themes |
| `@brika/clay/tokens` | `TOKEN_REGISTRY`, `TokenSpec`, type helpers |
| `@brika/clay/tailwind` | Tailwind v4 plugin |
| `@brika/clay/styles` | `clay.css` — utilities + components.css bridges |

## Token system

Clay's CSS tokens are organised in three layers, all driven by a single
hand-authored TypeScript registry at
[`src/tokens/registry.ts`](src/tokens/registry.ts). The Tailwind plugin
([`src/tailwind.ts`](src/tailwind.ts)) reads the registry at compile time
and emits `:root` defaults, dark-mode overrides, and `theme.extend`
entries — there are no generated CSS files; the TypeScript registry is
the single source of truth.

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

The full reference is published at
[clay.brika.dev/tokens](https://clay.brika.dev/tokens) and exported as
TypeScript at `@brika/clay/tokens` (`TOKEN_REGISTRY`, `TokenSpec`).

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

Seventeen first-party themes ship today: the eleven colour-only palette
themes (default, ocean, forest, sunset, lavender, ruby, nord, solarized,
candy, dracula, mono) plus six showcase themes that exercise the full
token surface — **Brutalist** (geometry + borders + typography),
**Editorial** (typography + radii + motion), **Terminal** (monospace,
zero radius, dashed dividers), **Skeuomorph** (heavy shadows + slow
motion), **Glass** (translucency + blur), and **Comic** (playful
geometry + bold borders). Browse them all in the docs site's theme
switcher to see how deeply they retune the same components.

### Applying a theme

```ts
import { applyTheme, brutalist } from "@brika/clay/themes";

// Document-wide. Returns a cleanup function that removes the style tag.
const cleanup = applyTheme(brutalist);

// Toggle dark mode without re-applying:
document.documentElement.setAttribute("data-mode", "dark");

cleanup();
```

`applyTheme` injects a single `<style id="clay-theme">` containing both
the `:root` light defaults and a `:is(.dark, [data-mode="dark"]):root`
block for dark overrides. Toggling the attribute afterwards costs
nothing — the dark block activates via CSS, no JS re-run.

For SSR, embed `renderThemeStyleSheet(theme)` in the document `<head>`
to avoid FOUC; `applyTheme` reuses the existing tag idempotently when
the client mounts.

### Scoped themes — `ThemeScope`

Apply a theme to a subtree without inflating the rendered HTML. The
default mode renders a `<div>` with `display: contents` so the wrapper
doesn't form a layout box; CSS variables still inherit through it.

```tsx
import { ocean, ThemeScope } from "@brika/clay/themes";

<ThemeScope theme={ocean} mode="light">
  <Button>Ocean button</Button>
</ThemeScope>
```

For zero-DOM theming, pass `asChild` and a single child element. The
theme attributes are merged onto the child via Radix Slot:

```tsx
<ThemeScope theme={ocean} asChild>
  <article className="prose">…</article>
</ThemeScope>
```

`ThemeScope` deduplicates the underlying `<style>` tag via React 19's
`href`-keyed stylesheet hoisting — fifty `ThemeScope`s of `dracula`
share one tag in `<head>`.

For inline preview vars (gallery cards, side-by-side comparisons) use
`themeToCssVars(theme, mode)` — it returns a React `style`-prop object
with every registry token pinned, which resists leaks from a globally
applied theme.

## Layout

```
src/
  components/<name>/           # one folder per component
  primitives/                  # cn, cssVars, useIsMobile — cross-cutting helpers
  styles/
    clay.css                   # entry: @plugin + utilities + safe-area + corner shapes
    components.css             # hand-authored token → CSS bridges
  themes/
    apply.ts                   # applyTheme, resetThemeVars, themeToCssVars
    flatten.ts                 # pure flattenTheme + renderThemeStyleSheet
    ThemeScope.tsx             # scoped-theme React component
    types.ts                   # ThemeConfig and friends
    presets/*.json             # 17 first-party themes
  tokens/
    registry.ts                # SOURCE OF TRUTH — every CSS variable
    types.ts                   # TokenSpec, TokenLayer, TokenCategory
    expand.ts                  # helpers that generate per-component token sets
  tailwind.ts                  # Tailwind v4 plugin (reads registry at compile time)
```

## Bundle considerations

- The `code-block` component pulls in `shiki` (~3 MB unminified) for
  syntax highlighting. If you don't import `code-block`, modern bundlers
  will tree-shake it out — the package is marked `"sideEffects": false`
  for JS files (CSS is preserved).
- Themes are JSON imports inlined into the build. The full theme surface
  adds ~25 KB minified across all 17 presets.
- The barrel (`import { Button } from "@brika/clay"`) re-exports
  everything; for production bundles prefer the granular paths
  (`@brika/clay/components/button`).

## License

MIT © Brika. See [LICENSE](LICENSE).
