# Externals Rewrite

Brika plugins write standard React JSX. They `import * as React from 'react'`, `import { Cloud } from 'lucide-react'`, `import clsx from 'clsx'`. **None of those imports actually resolve to npm packages in the compiled output.** The compiler rewrites every one of them to a lookup on `globalThis.__brika.*` — a bridge the host UI populates before any brick loads.

This is how a 5 KB brick stays 5 KB and shares its React instance with the host.

## The bridge map

`packages/compiler/src/plugins/externals.ts` holds the canonical list:

```ts
const BRIDGE: Record<string, string> = {
  react: 'React',
  'react/jsx-runtime': 'jsx',
  'react/jsx-dev-runtime': 'jsx',
  '@brika/sdk/ui-kit': 'ui',
  '@brika/sdk/ui-kit/icons': 'icons',
  'lucide-react': 'icons',
  '@brika/sdk/ui-kit/hooks': 'hooks',
  '@brika/sdk/brick-views': 'brickHooks',
  '@brika/sdk/block-views': 'blockHooks',
  clsx: 'clsx',
  'class-variance-authority': 'cva',
};
```

Adding a shared dependency requires two lines: one here, one in the UI's `plugin-bridge.ts`.

## The transform

```ts
build.onResolve({ filter: BRIDGE_FILTER }, (args) => ({
  path: args.path,
  namespace: 'brika-ext',
}));

build.onLoad({ namespace: 'brika-ext', filter: /.*/ }, (args) => ({
  contents: `module.exports=globalThis.__brika.${BRIDGE[args.path]};`,
  loader: 'js',
}));
```

* `onResolve` claims the matched specifier and puts it in the `brika-ext` namespace.
* `onLoad` synthesises a tiny module whose default export is the bridge property.

The filter is **exact** — `^(?:react|react/jsx-runtime|…)$`. In Bun, returning `undefined` from an `onResolve` whose filter matched still consumes the import and drops it. A broad filter would silently break any unbridged package import (`recharts`, `date-fns`, …).

## The UI side

`apps/ui/src/features/plugins/components/plugin-bridge.ts` builds the global before any brick is loaded:

1. The file's top-level body has a top-level `await` that lazy-loads `lucide-react`, `@brika/clay`, `class-variance-authority`, `clsx`.
2. It builds an object with 9 properties: `React`, `jsx`, `hooks`, `brickHooks`, `blockHooks`, `icons`, `ui`, `cva`, `clsx`.
3. It assigns it to `globalThis.__brika ??= bridge` — idempotent so re-imports don't double-populate.

`useModuleImport(url)` imports the bridge as a side effect *before* doing the dynamic `import(url)`. The browser's module graph guarantees the bridge is populated by the time the brick's first line runs.

The `jsxDEV` wrapper delegates to `jsxs` for static nodes and `jsx` for dynamic ones — a small shim so the brick can use either `react/jsx-runtime` or `react/jsx-dev-runtime` and behave identically.

## Why not just bundle?

Three reasons:

1. **Shared instance.** A brick that owns its own React would lose hooks and break context (each `useContext` looks for the React-internal store on `globalThis`).
2. **Bundle size.** React + lucide-icons + clsx + class-variance-authority alone is hundreds of KB. Per brick, repeated across many bricks, the page bloat would dominate.
3. **Theming.** `@brika/clay` ships theme tokens and component primitives the host owns. Bricks consuming them via the bridge inherit the active theme automatically.

## What is **not** bridged

* npm dependencies the plugin actually owns (`recharts`, `date-fns`, `viem`). These get bundled into the brick.
* `react-dom` — bricks render via the host's `ReactDOM`; they never call it directly.
* The plugin's own source files. Bundled.

## SonarCloud S6477

The `key` prop is passed through to React unchanged. SonarQube rule S6477 flags any code that hand-rolls a `key` outside a list iteration. Brika treats it as a real warning, not a false positive — there is no custom JSX runtime, so the rule's intent (catch accidental key passing) applies normally.

## tsconfig

Plugins must set `"jsxImportSource": "react"` in `tsconfig.json`. **Never** `"@brika/sdk"` — there is no such subpath export. The compiler rewrites `react/jsx-runtime` to the bridge, so React-source JSX is exactly what we want.

## See also

* **[Compiler](compiler.md)** — overall pipeline.
* **[Brick Rendering](brick-rendering.md)** — how bricks are loaded after the bridge is in place.
