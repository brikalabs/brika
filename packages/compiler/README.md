# @brika/compiler

The Brika plugin **compile gate**: given a plugin's source files, it accepts or
rejects the plugin (does its browser code actually compile?) and returns a
**report** of what the plugin ships (capabilities + server actions).

It runs in two runtimes behind one **identical API**, so you pick the route that
matches where you're running and call the same function:

| Import | Runtime | Backend |
| --- | --- | --- |
| `@brika/compiler/bun` | Bun | native `Bun.build` |
| `@brika/compiler/v8` | V8 isolate / **Cloudflare Worker** | rollup + sucrase (pure JS, no Bun) |

The `/v8` route is a self-contained bundle with no Node/Bun dependencies, so it
runs inside a Worker at plugin-publish time.

## Gate a plugin

```ts
import { compilePluginGate } from "@brika/compiler/v8"; // or "/bun"

const result = await compilePluginGate({
  sources: new Map([
    ["package.json", pkgJson],
    ["src/bricks/current.tsx", brickSource],
    ["src/actions.ts", actionsSource],
  ]),
  entrypoints: ["src/bricks/current.tsx"],
  log: (event, meta) => console.log(event, meta), // gate:start | gate:accept | gate:reject
});

if (!result.ok) {
  // reject the publish; result.error is the compile error
} else {
  result.report.manifest; // bricks / blocks / pages / sparks / tools (from package.json)
  result.report.actions;  // [{ file, name, actionId }] discovered in the sources
}
```

The two routes are a **drop-in swap** — same options, same result shape — so you
can develop against Bun and run the isolate build in a Worker with no code change.

## Just bundle

```ts
import { createCompiler } from "@brika/compiler/v8";

const compiler = createCompiler();           // a Bundler for this route's backend
const out = await compiler.bundle({ entrypoints, pluginRoot, readFile });
```

## Provenance

Every emitted file carries a `/* @brika-bundle:<backend>@<fingerprint> */` banner
(`stamp` / `readStamp`). The fingerprint is the compiler's content hash, baked in
at build time, so an artifact maps 1:1 to the exact compiler that produced it.

---

The bare `@brika/compiler` entry is the **Bun-only** internal surface used by the
Brika hub (`BunBundler`, `compileClientModule`, …); external consumers use the
`/bun` or `/v8` routes above.
