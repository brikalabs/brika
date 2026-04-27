# Adding a new component to Clay

A Clay component is a folder under `src/components/<name>/` that owns its
React code, design tokens, CSS bridge rules, and metadata. Tokens land
in the registry (where the Tailwind plugin reads them at compile time),
CSS lands in the per-component file, the manifest picks them up, and
the docs site indexes the component automatically via `meta.ts`.

## Checklist

For a component named `<name>` (kebab-case, matches the CSS prefix):

1. Create folder `src/components/<name>/`
2. Files inside the folder:
   - `<name>.tsx` -- React component, sets `data-slot="<name>"` on the root
   - `tokens.ts` -- Layer-2 tokens, registered via `registerTokens([...])`
   - `<name>.css` -- bridge rules keyed by `[data-slot="<name>"]` and any `corner-<name>` utility
   - `meta.ts` -- `name`, `displayName`, `group`, `description` for the docs site
   - `index.ts` -- one-line barrel re-export
3. Register the component in two manifests:
   - Add `import '../components/<name>/tokens';` to [`src/tokens/components.ts`](../tokens/components.ts)
   - Add `@import "../components/<name>/<name>.css";` to [`src/styles/components.css`](../styles/components.css)
4. Re-export from [`src/index.ts`](../index.ts) if the component is part of the public API

That's it. No edits to `clay.css`, `tailwind.ts`, `tsup.config.ts`, or
the registry files. The Tailwind plugin scans the per-component CSS for
`var(--…)` references; tsup's `onSuccess` copies each `<name>.css` to
its dist folder.

## Files in detail

### `<name>.tsx`

The React component. Set `data-slot="<name>"` on the rendered root so
the bridge rules in `<name>.css` apply. Use `cva()` for variants that
need to be data-attribute-discoverable (`data-variant`, `data-size`).
Read tokens via Tailwind utilities (`bg-card-container`, `rounded-card`,
`shadow-card`, etc.) and arbitrary-value classes (`px-[var(--card-padding-x)]`)
where a token has no namespaced utility.

```tsx
import * as React from 'react';
import { cn } from '../../primitives/cn';

function MyComponent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="my-component"
      className={cn(
        'corner-my-component rounded-my-component bg-my-component-container text-my-component-label shadow-my-component',
        className,
      )}
      {...props}
    />
  );
}

export { MyComponent };
```

### `tokens.ts`

Layer-2 component tokens, registered via `registerTokens([...])`.
Helpers in [`../../tokens/expand.ts`](../tokens/expand.ts) collapse the
common token families:

- `defineComponentTokens(meta, { … })` -- arbitrary named slots (radius, shadow, container, label, etc.)
- `controlSurfaceTokens(meta, geometry, typography, borderWidth?)` -- height/padding/gap + font-weight/size + border for interactive controls
- `borderTokens(meta, defaultWidth)` -- border-width / border-style
- `geometryTokens(meta, { paddingX, paddingY, gap })` -- bare geometry without surface assumptions
- `motionTokens(meta)` -- duration + easing
- `typographyTokens(meta, { fontSize, fontWeight, letterSpacing, textTransform })` -- text properties
- `focusTokens(meta)` -- ring width / offset / color

Mix them. See [`button/tokens.ts`](./button/tokens.ts) for a control,
[`card/tokens.ts`](./card/tokens.ts) for a surface, [`dialog/tokens.ts`](./dialog/tokens.ts)
for a focusable surface.

```ts
import { registerTokens } from '../../tokens/component-registry';
import {
  borderTokens,
  meta as buildMeta,
  defineComponentTokens,
  motionTokens,
} from '../../tokens/expand';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    radius: { default: 'var(--radius-container)', description: 'Corner radius.', alias: 'my-component' },
    shadow: { default: 'var(--shadow-surface)', description: 'Resting elevation.', alias: 'my-component' },
    'corner-shape': { default: 'var(--corner-shape, round)', description: 'Corner geometry.' },
    container: { default: 'var(--card)', description: 'Surface background.' },
    label: { default: 'var(--card-foreground)', description: 'Label color.' },
  }),
  ...borderTokens(m, '1px'),
  ...motionTokens(m),
]);
```

The `alias` field above sets the Tailwind utility name (so `rounded-my-component`
exists; without it the utility would be `rounded-my-component-radius`).

### `<name>.css`

Two kinds of rule belong here:

1. **Bridge rules** keyed by `[data-slot="<name>"]` for properties that
   Tailwind utilities don't naturally control (letter-spacing, text-transform,
   transition-duration, transition-timing-function, border-width, backdrop-filter).
   Use CSS nesting for variants and orientations.
2. **Corner utility** `@utility corner-<name>` reading `--<name>-corner-shape`
   with a fallback chain to `--corner-shape, round`.

```css
/**
 * MyComponent -- properties Tailwind utilities don't naturally control.
 */

[data-slot="my-component"] {
  border-width: var(--my-component-border-width, var(--border-width));
  border-style: var(--my-component-border-style, solid);
  transition-duration: var(--my-component-duration);
  transition-timing-function: var(--my-component-easing);
}

@utility corner-my-component {
  corner-shape: var(--my-component-corner-shape, var(--corner-shape, round));
}
```

Skip this file entirely if your component needs no bridge rules and no
corner utility. Most do.

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

## Manifest edits

The two central edits are mechanical -- one line each, alphabetically sorted:

**`src/tokens/components.ts`:**
```ts
import '../components/my-component/tokens';
```

**`src/styles/components.css`:**
```css
@import "../components/my-component/my-component.css";
```

That's the only place anywhere in the package that needs to know your
component exists. `clay.css`, `tailwind.ts`, `tsup.config.ts`, and the
registry never need to be touched.

## What you don't need to do

- Add anything to `tailwind.ts`. The plugin's source-CSS scanner
  globs `src/components/*/*.css` automatically.
- Add anything to `tsup.config.ts`. The build step copies every
  per-component `<name>.css` into its dist folder.
- Hand-write `:root` variables. The plugin emits them from the registry
  (and types them via `@property` where the type allows).
- Touch theme JSON unless your tokens need theme-specific overrides.
  Defaults from `tokens.ts` already work in every preset.

## Common gotchas

- **`data-slot` vs class names.** The bridge rules key off `data-slot`,
  not className. `data-slot` survives className overrides; a class
  doesn't. Always set it on the rendered root.
- **Utility name vs token name.** `alias: 'my-component'` makes the
  utility `rounded-my-component`. Without an alias, the utility is
  `rounded-my-component-radius` (the full token name). Use `alias`
  for the public-facing utility short form.
- **Token naming convention.** All Layer-2 tokens are prefixed with
  the component name: `--my-component-radius`, `--my-component-padding-x`,
  etc. The infer rules in [`../../tokens/infer.ts`](../tokens/infer.ts)
  map suffixes to types, so `*-radius` is a `radius` token,
  `*-duration` is a `duration` token, etc. Stick to the convention so
  the registry's `type` field is auto-inferred and `@property`
  emission picks the right CSS syntax.
- **Orphan components.** Components without a folder yet (alert,
  checkbox, icon, toast at time of writing) live in
  [`../tokens/orphan-components.ts`](../tokens/orphan-components.ts)
  and [`../styles/orphan-components.css`](../styles/orphan-components.css).
  When you graduate one to a folder, move both blocks into the new
  folder's `tokens.ts` and `<name>.css`, and delete the orphan
  entries.
- **Multi-slot components.** Dialog has `dialog-content`, dropdown-menu
  has `dropdown-menu-content` and `menu-item`, etc. Put all sibling
  `[data-slot="<name>-…"]` rules in the parent component's `<name>.css`.

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
