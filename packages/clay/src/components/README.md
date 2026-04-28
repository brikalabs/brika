# Adding a new component to Clay

A Clay component is a folder under `src/components/<name>/` that owns its
React code, design tokens, and metadata. Tokens land in the registry
(where the Tailwind plugin reads them at compile time) and the docs
site indexes the component automatically via `meta.ts`. Components no
longer ship per-file CSS — every token-driven property is composed
inline in the `.tsx` via Tailwind v4 arbitrary-class syntax.

## Checklist

For a component named `<name>` (kebab-case, matches the token prefix):

1. Create folder `src/components/<name>/`
2. Files inside the folder:
   - `<name>.tsx` -- React component, sets `data-slot="<name>"` on the root for devtools / test selectors
   - `tokens.ts` -- Layer-2 tokens, exports a `tokens` array built via `defineComponent(...)`
   - `meta.ts` -- `name`, `displayName`, `group`, `description` for the docs site
   - `index.ts` -- one-line barrel re-export
3. Add a named import of `tokens` and a spread into the array in [`src/tokens/components.ts`](../tokens/components.ts)
4. Re-export from [`src/index.ts`](../index.ts) if the component is part of the public API

That's it. No edits to `clay.css`, `tailwind.ts`, `tsup.config.ts`, or
any CSS manifest. The Tailwind plugin scans every `<name>.tsx` for
`var(--…)` and Tailwind-v4 `(--…)` shorthand references and emits the
matching `:root` defaults.

## Composing token-driven properties in `.tsx`

There are three syntactic forms, picked by what Tailwind exposes for
the property:

1. **Ergonomic shorthand** — `gap-(--button-gap)`, `px-(--button-padding-x)`,
   `tracking-(--button-letter-spacing)`, `duration-(--button-duration)`,
   `ease-(--button-easing)`, `font-(--button-font-weight)`. Use this when
   the Tailwind utility unambiguously maps to one CSS property.
2. **Type-hinted shorthand** — `border-(length:--button-border-width)`,
   `font-(family-name:--code-block-font-family)`. Use this when the
   utility is overloaded (`border-` could be width or color, `font-`
   could be family or weight) so Tailwind needs the data-type hint.
3. **Arbitrary property** — `[corner-shape:var(--button-corner-shape,var(--corner-shape,round))]`,
   `[backdrop-filter:blur(var(--card-backdrop-blur,0px))]`,
   `[border-style:var(--input-border-style)]`,
   `[text-transform:var(--button-text-transform)]`. Use this when there
   is no Tailwind utility for the property at all (`corner-shape`,
   `backdrop-filter`, `border-style` with a CSS variable, `text-transform`
   with a CSS variable).

Every rounded surface in Clay adds the shared `corner-themed` utility,
which expands to `corner-shape: var(--corner-shape, round)`. That picks
up whatever Houdini corner geometry the active theme sets globally
(`round`, `bevel`, `scoop`, `notch`, `squircle`, `superellipse(N)`).
For a one-off per-component shape, use a Tailwind v4 arbitrary
property: `[corner-shape:bevel]`.

## Files in detail

### `<name>.tsx`

The React component. Set `data-slot="<name>"` on the rendered root as a
devtools / test selector (no CSS reads it). Use `cva()` for variants;
expose them as `data-variant` / `data-size` attributes alongside any
className contribution. Read tokens via Tailwind utilities
(`bg-card-container`, `rounded-card`, `shadow-card`) where the token
has a namespaced utility, and via the three arbitrary forms above for
everything else.

```tsx
import * as React from 'react';
import { cn } from '../../primitives/cn';

function MyComponent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="my-component"
      className={cn(
        'corner-themed rounded-my-component bg-my-component-container text-my-component-label shadow-my-component border-(length:--my-component-border-width) [border-style:var(--my-component-border-style)] duration-(--my-component-duration) ease-(--my-component-easing)',
        className,
      )}
      {...props}
    />
  );
}

export { MyComponent };
```

### `tokens.ts`

Layer-2 component tokens, built via the single
[`defineComponent`](../tokens/define.ts) entry point and exported as a
`tokens` array. Every option is a named key — TypeScript autocompletes
everything you can pass.

```ts
import { defineComponent } from '../../tokens/define';
import { SPACING_4, SPACING_6 } from '../../tokens/spacing';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: { default: 'var(--radius-container)', description: 'Corner radius.', alias: 'my-component' },
  shadow: { default: 'var(--shadow-surface)', description: 'Resting elevation.', alias: 'my-component' },
  border: '1px',
  motion: true,
  geometry:   { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 },
  typography: { fontSize: 'var(--text-body-md)' },
  slots: {
    container: { default: 'var(--card)', description: 'Surface background.' },
    label:     { default: 'var(--card-foreground)', description: 'Label color.' },
  },
});
```

**What each top-level key does:**

| Key | Effect |
|---|---|
| `radius`, `shadow`, `backdropBlur` | Single conventional tokens (`--<name>-radius`, etc.). The `alias` field controls the Tailwind utility name (`rounded-<alias>`). |
| `surface: true` | Bundle for interactive surfaces: `border + motion`. Pass `{ borderWidth: '1px' }` to set the resting border width. |
| `border`, `motion` | Granular opt-in when only one is needed (e.g. Card uses `border: '1px'` + `motion: true`). |
| `geometry: {...}` | Sizing tokens (`height`, `paddingX`, `paddingY`, `gap`) — only the keys you pass become tokens. |
| `typography: {...}` | Text tokens (`fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textTransform`). Omit entirely to skip every typography token (e.g. Switch). |
| `slots: {...}` | Arbitrary named tokens — semantic colors (`filled-container`), custom sizes (`track-width`), anything component-specific. |
| `themeKey?` | Override the camelCase theme key when it differs from the kebab-case name (e.g. `'switchThumb'` for `'switch-thumb'`). |

**Multi-namespace components** (e.g. Switch + SwitchThumb,
DropdownMenu + DropdownMenuItem) export a `tokens` array that spreads
two `defineComponent` results — see
[`switch/tokens.ts`](./switch/tokens.ts) and
[`dropdown-menu/tokens.ts`](./dropdown-menu/tokens.ts).

See [`button/tokens.ts`](./button/tokens.ts) for an interactive control,
[`card/tokens.ts`](./card/tokens.ts) for a non-interactive surface, and
[`dialog/tokens.ts`](./dialog/tokens.ts) for a translucent floating surface.

### `meta.ts`

Metadata consumed by the docs site for sidebar grouping and the page
header. `group` must be one of the values in
[`_registry.ts`](./_registry.ts#L14): `Primitives`, `Forms`, `Overlays`,
`Navigation`, `Feedback`, `Layout`, `Data`.

```ts
import type { ComponentMeta } from '../_registry';

export const meta: ComponentMeta = {
  name: 'my-component',
  displayName: 'MyComponent',
  group: 'Layout',
  description: 'One-paragraph blurb shown atop the docs page.',
};
```

### `index.ts`

```ts
export * from './my-component';
```

## What you don't need to do

- Write a `<name>.css` file. They no longer exist; properties Tailwind
  utilities can't express are composed inline as arbitrary-property classes.
- Edit any CSS manifest. There is no per-component CSS to import.
- Add anything to `tailwind.ts`. The plugin scans every `<name>.tsx`
  for `var(--…)` and `(--…)` references automatically.
- Add anything to `tsup.config.ts`. There is no per-component CSS to copy.
- Hand-write `:root` variables. The plugin emits them from the registry
  (and types them via `@property` where the type allows).
- Touch theme JSON unless your tokens need theme-specific overrides.
  Defaults from `tokens.ts` already work in every preset.

## Common gotchas

- **Token naming convention.** All Layer-2 tokens are prefixed with
  the component name: `--my-component-radius`, `--my-component-padding-x`,
  etc. The infer rules in [`../../tokens/infer.ts`](../tokens/infer.ts)
  map suffixes to types, so `*-radius` is a `radius` token,
  `*-duration` is a `duration` token, etc. Stick to the convention so
  the registry's `type` field is auto-inferred and `@property` emission
  picks the right CSS syntax.
- **Utility name vs token name.** `alias: 'my-component'` makes the
  utility `rounded-my-component`. Without an alias, the utility is
  `rounded-my-component-radius` (the full token name). Use `alias`
  for the public-facing utility short form.
- **Multi-slot components.** Dialog has a `dialog-content`, dropdown-menu
  has `dropdown-menu-content` and `dropdown-menu-item`, etc. Each slot
  sets its own `data-slot` and composes its own classes inline in the
  `.tsx` — no CSS bridge selector ties them together.
- **Bare tokens.** Tokens that don't follow the `<name>-<slot>`
  convention (e.g. `--icon` with no slot suffix) can be appended to the
  exported `tokens` array as plain `TokenSpec` literals — see
  [`icon/tokens.ts`](./icon/tokens.ts).

## Verifying

```bash
bun --filter '@brika/clay' typecheck
bun --filter '@brika/clay' test
bun run --filter '@brika/clay' build
bun run --filter '@brika/clay-docs' dev
```

The docs site picks up the new component automatically via `meta.ts`.
If you don't see it, check that the file is exported from
`src/index.ts` and that `meta.ts` exports a value named `meta`.
