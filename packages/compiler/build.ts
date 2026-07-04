/**
 * Publish build: emit the plugin gate for two runtimes as two routes with the
 * SAME API. Both are the same source (`src/bundle/gate.ts`) exporting
 * `compilePluginGate`; only the Bun.build target differs, so a consumer picks
 * the route matching its runtime and calls the identical function:
 *
 *   @brika/compiler/bun  -> dist/bun/index.js   built for the Bun runtime
 *   @brika/compiler/v8   -> dist/v8/index.js    built for a V8 isolate / Worker
 *
 * The gate itself is pure JS (rollup + sucrase), so it behaves identically on
 * both; the two builds only differ in how node: builtins are handled. The
 * `output-version` macro runs here (under Bun.build) and its fingerprint is
 * injected via `define`, so the shipped artifacts carry it as a constant - a
 * consumer never runs Bun or the macro.
 *
 *   bun run build
 */
import { execSync } from 'node:child_process';
import { OUTPUT_VERSION } from './src/output-version';

const dir = import.meta.dir;
const common = {
  naming: 'index.[ext]', // resolve routes to dist/<rt>/index.js
  minify: true,
  // Bakes the fingerprint in place of the sentinel each route reads at load time.
  define: { 'process.env.BRIKA_GATE_VERSION': JSON.stringify(OUTPUT_VERSION) },
} as const;

const bun = await Bun.build({
  ...common,
  entrypoints: [`${dir}/src/bundle/route-bun.ts`],
  outdir: `${dir}/dist/bun`,
  target: 'bun',
});
if (!bun.success) {
  console.error('bun build failed:', bun.logs.map(String));
  process.exit(1);
}

const v8 = await Bun.build({
  ...common,
  entrypoints: [`${dir}/src/bundle/route-v8.ts`],
  outdir: `${dir}/dist/v8`,
  target: 'browser',
});
if (!v8.success) {
  console.error('v8 build failed:', v8.logs.map(String));
  process.exit(1);
}

// Bun cannot emit .d.ts, so bundle a self-contained declaration per route (types
// are inlined; internal `@brika/sdk` build-deps do not leak into the public API).
for (const [entry, rt] of [
  ['route-v8', 'v8'],
  ['route-bun', 'bun'],
] as const) {
  execSync(
    `bunx dts-bundle-generator --no-check --no-banner -o dist/${rt}/index.d.ts src/bundle/${entry}.ts`,
    { cwd: dir, stdio: 'pipe' }
  );
}

console.log(
  `built dist/bun + dist/v8 (compilePluginGate + .d.ts) with fingerprint ${OUTPUT_VERSION}`
);
