# @brika/compiler

Plugin bundler used by the hub and `create-brika`. Turns a plugin source tree into the single-file artifact the hub loads at runtime.

## What it does

- Wraps Bun's bundler with the Brika-specific defaults: TypeScript ESNext target, JSX auto-runtime, externalizes `@brika/*` peer deps.
- Inlines static assets (icons, locale JSON, prompt fragments) through Bun macros, so the resulting bundle can run from `$bunfs/` in a compiled hub binary without filesystem lookups.
- Emits a manifest hash that the registry signer (`@brika/registry`) consumes.

## Usage

```bash
brika build               # via @brika/sdk author CLI, in a plugin workspace
```

The package exposes the steps `brika build` orchestrates rather than a single
entry point. The main exports are `compileServerEntry`, `compileClientBundle` /
`compileClientModule`, `generateEntry`, `generateManifest`, and `validatePlugin`
(plus the `Bun.build` plugins `brikaExternalsPlugin`, `brikaActionsPlugin`, and
`brikaServerActionsPlugin`).

```ts
import { compileServerEntry } from '@brika/compiler';

const result = await compileServerEntry({
  entrypoint: '/abs/path/to/plugin/src/index.tsx',
  outdir: '/abs/path/to/plugin/node_modules/.cache/brika/server',
});
```

## Why not just call `Bun.build` directly?

Plugins have a small list of cross-cutting concerns (peer deps, manifest hashing, asset inlining, signature stub generation) that need to be applied identically every time. Centralizing them here means a plugin author writes a normal TypeScript entry point and gets a reproducible artifact.
