# JSX Runtime

Brika plugins write standard React JSX. There is **no custom JSX runtime** —
the compiler swaps `react/jsx-runtime` imports out of the plugin bundle and
points them at the host's React at runtime.

If you only need to write plugins, you can stop here:
- Use `.tsx`, write `<div>…</div>`, import from `react` if you ever need to.
- Your `tsconfig.json` should extend `@brika/sdk/tsconfig.plugin.json` and set
  `jsx: "react-jsx"`, `jsxImportSource: "react"` (the scaffolder does this).
- Plugin bricks render in a host React tree; lifecycle and hooks behave as
  they would in any React app.

The rest of this page is how it works under the hood.

## How it works

A plugin author writes:

```tsx
import { useBrickData } from '@brika/sdk/brick-views';

export default function MyBrick() {
  const data = useBrickData<{ temp: number }>();
  return <div>{data?.temp ?? '—'}°C</div>;
}
```

TypeScript with `jsx: "react-jsx"` emits:

```js
import { jsx as _jsx } from 'react/jsx-runtime';
import { useBrickData } from '@brika/sdk/brick-views';

export default function MyBrick() {
  const data = useBrickData();
  return _jsx('div', { children: data?.temp ?? '—' + '°C' });
}
```

The compiler ([packages/compiler/src/plugins/externals.ts](../../../packages/compiler/src/plugins/externals.ts))
intercepts a small allowlist of imports and rewrites each into a reference
to `globalThis.__brika.<name>`:

| Plugin import                  | Bundle becomes                  |
|--------------------------------|---------------------------------|
| `react`                        | `globalThis.__brika.React`      |
| `react/jsx-runtime`            | `globalThis.__brika.jsx`        |
| `react/jsx-dev-runtime`        | `globalThis.__brika.jsx`        |
| `@brika/sdk/ui-kit`            | `globalThis.__brika.ui`         |
| `@brika/sdk/ui-kit/icons`      | `globalThis.__brika.icons`      |
| `lucide-react`                 | `globalThis.__brika.icons`      |
| `@brika/sdk/ui-kit/hooks`      | `globalThis.__brika.hooks`      |
| `@brika/sdk/brick-views`       | `globalThis.__brika.brickHooks` |
| `clsx`                         | `globalThis.__brika.clsx`       |
| `class-variance-authority`     | `globalThis.__brika.cva`        |

The host UI populates `globalThis.__brika` before any brick module loads
([apps/ui/src/features/plugins/components/plugin-bridge.ts](../../../apps/ui/src/features/plugins/components/plugin-bridge.ts)).
`__brika.jsx` is React's real `jsx-runtime` plus a hand-rolled `jsxDEV` that
routes to `jsxs`/`jsx` based on the `isStatic` flag.

## Why

Two goals:

1. **Don't ship React in every plugin bundle.** A typical brick is now a few
   kilobytes instead of pulling React + lucide + clsx for every install.
2. **Guarantee one React instance across all bricks.** Without this, two
   bricks could each load their own React and break hooks via the
   "Invalid hook call — mismatched dispaching React" runtime error.

## Things to know

- **The `key` prop is passed through** — React handles it exactly as it does
  outside Brika. List-rendering warnings (Sonar S6477 etc.) are real.
- **`jsxDEV` is reimplemented** by the host as a thin wrapper instead of
  pulling React's `jsx-dev-runtime`. Side effect: React's DEV-only duplicate-
  key console warnings are not emitted; lint and CI cover that gap.
- **You can `import * as React from 'react'`** — it's the host's React; it
  exposes the full surface, but importing rarely-used internals is a smell:
  prefer the named imports the SDK provides through `@brika/sdk/ui-kit/hooks`.
- **If your plugin imports a package that is NOT on the bridge list above**
  (e.g. `framer-motion`), it ships inside your bundle and runs against its
  own React copy if it ships one. Add it to the bridge map if it's a common
  enough dependency that the host should provide it instead.

## Pitfalls

- **Do not** override `globalThis.__brika` in plugin code. The brand symbol
  on the bridge object lets the host detect tampering; future tiers of the
  sandbox roadmap will freeze the global to prevent this entirely (see
  [sandbox-roadmap.md](../architecture/sandbox-roadmap.md)).
- **Do not** set `jsxImportSource: "@brika/sdk"` in your plugin's
  `tsconfig.json`. The SDK does not publish a `jsx-runtime` subpath export;
  the externals filter only catches the literal strings `react/jsx-runtime`
  and `react/jsx-dev-runtime`. Always use `jsxImportSource: "react"`.
