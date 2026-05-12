# @brika/compiler

Plugin bundler used by the hub and `create-brika`. Turns a plugin source tree into the single-file artifact the hub loads at runtime.

## What it does

- Wraps Bun's bundler with the Brika-specific defaults: TypeScript ESNext target, JSX auto-runtime, externalizes `@brika/*` peer deps.
- Inlines static assets (icons, locale JSON, prompt fragments) through Bun macros, so the resulting bundle can run from `$bunfs/` in a compiled hub binary without filesystem lookups.
- Emits a manifest hash that the registry signer (`@brika/registry`) consumes.

## Usage

```bash
brika build               # via @brika/hub CLI, in a plugin workspace
```

```ts
import { compilePlugin } from '@brika/compiler';

await compilePlugin({
  entry: './src/index.ts',
  outDir: './dist',
  manifest: pkgJson.brika,
});
```

## Why not just call `Bun.build` directly?

Plugins have a small list of cross-cutting concerns (peer deps, manifest hashing, asset inlining, signature stub generation) that need to be applied identically every time. Centralizing them here means a plugin author writes a normal TypeScript entry point and gets a reproducible artifact.
