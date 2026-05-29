# Compiler

`@brika/compiler` is the build-time machinery that turns plugin source into runnable bundles. It compiles bricks and pages for the browser, compiles the plugin entrypoint for Bun, injects deterministic action IDs, rewrites externals to `globalThis.__brika.*`, and scopes Tailwind CSS so styles never leak into the host.

Key files:

* `packages/compiler/src/compile-client.ts` — brick/page bundling for the browser.
* `packages/compiler/src/compile-server.ts` — server entry bundling for Bun.
* `packages/compiler/src/action-hash.ts` — deterministic action ID.
* `packages/compiler/src/hash-sources.ts` — content hashing of plugin sources.
* `packages/compiler/src/plugins/externals.ts` — externals rewrite.
* `packages/compiler/src/plugins/actions-{client,server}.ts` — action ID injection.
* `packages/compiler/src/plugins/compose.ts` — transform composition.
* `packages/compiler/src/plugins/{node-fs,node-os}-shim.ts` — Node-builtin shims.
* `packages/compiler/src/plugins/i18n-call-site.ts` — i18n source-location injection.
* `apps/hub/src/runtime/modules/module-compiler.ts` — hub-side orchestration.
* `apps/hub/src/runtime/modules/tailwind.ts` — Tailwind scoping.

## Client compilation

`compileClientModule({ entrypoint, pluginRoot, sourceRoot? })`:

```ts
Bun.build({
  entrypoints: [entrypoint],   // src/bricks/<id>.tsx
  target: 'browser',
  format: 'esm',
  minify: true,
  plugins: [
    brikaExternalsPlugin(),    // rewrite bridge specifiers
    brikaActionsPlugin(root),  // replace action imports with stubs
    brikaForceSideEffectsPlugin(),
    brikaI18nCallSitePlugin(sourceRoot),
  ],
});
```

The output is a string of minified JavaScript. The hub serves it under a content-hashed URL (see [Cache](#content-hashed-cache)) and the [host UI](brick-rendering.md) dynamically imports it.

## Server compilation

`compileServerEntry({ entrypoint, pluginRoot, outdir, external, splitting? })`:

```ts
Bun.build({
  entrypoints: [entrypoint],
  outdir,
  naming: `[name].${hash}.[ext]`,
  target: 'bun',
  format: 'esm',
  splitting: true,
  minify: true,
  external,                    // @brika/sdk + every npm dep
  plugins: [
    composeTransforms([
      nodeFsShimTransform(),
      nodeOsShimTransform(),
      brikaServerActionsTransform(pluginRoot),
    ]),
  ],
});
```

Output goes to `{pluginRoot}/node_modules/.cache/brika/`. The hash-in-filename is the cache key — if a file with the hash already exists, the build is skipped.

## Externals rewrite

The browser bundle must not contain copies of React, lucide-react, or the SDK UI kit. The host UI already has them. The externals plugin rewrites the imports to look up `globalThis.__brika.*`:

```
import * as React from 'react';
// becomes
module.exports = globalThis.__brika.React;
```

See [Externals Rewrite](externals-rewrite.md) for the full bridge map and the host setup.

## Action ID injection

Actions get deterministic IDs via SHA-256:

```ts
__actionId = SHA-256(relativePath + '\0' + exportName).slice(0, 12)
```

Client and server both compute the same ID independently. The client plugin walks the source with `Bun.Transpiler.scan()`, finds files importing `@brika/sdk/actions`, and replaces every action export with `{ __actionId: '<hash>' }`. The server plugin appends a `__finalizeActions({ name: id }, { name: ref })` call at the bottom of each action module so the SDK can register handlers under the same IDs.

See [Actions](../plugins/actions.md) for the developer-facing story.

## Tailwind scoping

Each brick can use the full Tailwind v4 vocabulary. The hub's `TailwindCompiler`:

1. Extracts every quoted string from the compiled JS (these are class candidates).
2. Runs Tailwind over the candidates to produce a CSS bundle.
3. Strips `@layer properties`, `:root`, and `:host` blocks.
4. Re-wraps theme tokens (`--color-slate-900`, etc.) under `[data-brika-css="<module-key>"]` so they cannot collide with the host UI's tokens.
5. Minifies.
6. Inlines the CSS into the JS as a self-executing `<style data-brika-css="…">` injection — the `data-brika-css` attribute makes the injection idempotent, so re-importing the module does not duplicate the style.

The result: each brick's CSS lives in a scoped element selector, isolating its tokens, while still letting it use shared host tokens (which inherit through `:root`).

## Content-hashed cache

Server compile outputs: `{name}.{hash}.js`. Hash is blake2b256 truncated to 16 hex characters, computed over:

* `COMPILER_OUTPUT_VERSION` (bumped when the compiler's output format changes — forces global invalidation).
* The plugin's `package.json`.
* Every `src/**/*.{ts,tsx}` file.

The hash-in-filename pattern is intentional:

* No sidecar `.hash` files to keep in sync.
* `Cache-Control: immutable` is safe — the URL changes when the content does.
* Cache hits skip the whole `Bun.build` invocation.

Cache key on the hub side: `pluginName:bricks/moduleId` or `pluginName:pages/moduleId`.

## Compose pattern

The server plugin chain (`fs shim`, `os shim`, `actions`) is composed into a single `onLoad` callback rather than three separate Bun plugins. The reason: in Bun, separate `onLoad` callbacks for the same file shadow each other — only the first registered runs. `composeTransforms` chains them sequentially in a single callback so every transform sees the previous one's output.

Order matters: shims rewrite import specifiers; the actions transform scans the post-shim text and appends its finalisation footer.

## Node-builtin shims

Plugin code that imports `node:fs/promises` or `os` needs to route the call through the grant proxy. The shims:

* Match the import.
* Replace with a synthetic module (`__brika_fs_shim`, `__brika_os_shim`) that re-exports the grant-aware versions.

The plugin author writes `import { readFile } from 'node:fs/promises'`; the compiled output calls the SDK's grant proxy under the hood. No second blessed API.

## i18n call-site injection

The dev-mode i18n overlay needs to know which source line emitted each `t('key')` call. The `brikaI18nCallSitePlugin` rewrites:

```ts
t('devices.title')
// becomes
t('devices.title', { __cs: 'src/pages/devices.tsx:42' })
```

The runtime drops `__cs` in production builds (and from JSON-serialised messages); the dev overlay reads it to highlight the source location.

## Force-side-effects

Some modules have important side effects (registering a context module, registering verify-checks) that minifiers would tree-shake if marked `/* @__PURE__ */`. `brikaForceSideEffectsPlugin` marks these as side-effectful so they survive the bundle.

## See also

* **[Externals Rewrite](externals-rewrite.md)** — the bridge in detail.
* **[Brick Rendering](brick-rendering.md)** — what the host does with the compiled module.
* **[Actions](../plugins/actions.md)** — developer view of the ID injection.
* **[Type System](type-system.md)** — Zod → TypeDescriptor conversion that runs alongside compilation.
