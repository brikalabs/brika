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
import { writeFileSync } from 'node:fs';
import { generateDtsBundle } from 'dts-bundle-generator';
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

// Types are slow (~7s: a full TS program) and only needed to publish, so gate
// them behind `--dts` (prepack passes it; a plain `bun run build` stays ~0.3s).
// Bun cannot emit .d.ts, so bundle one self-contained declaration per route in a
// single shared compile; internal `@brika/sdk` build-deps do not leak out.
if (process.argv.includes('--dts')) {
  const [v8dts, bunDts] = generateDtsBundle(
    [
      { filePath: `${dir}/src/bundle/route-v8.ts`, output: { noBanner: true } },
      { filePath: `${dir}/src/bundle/route-bun.ts`, output: { noBanner: true } },
    ],
    { preferredConfigPath: `${dir}/tsconfig.json` }
  );
  writeFileSync(`${dir}/dist/v8/index.d.ts`, v8dts);
  writeFileSync(`${dir}/dist/bun/index.d.ts`, bunDts);
}

const kind = process.argv.includes('--dts') ? 'compilePluginGate + .d.ts' : 'compilePluginGate';
console.log(`built dist/bun + dist/v8 (${kind}) with fingerprint ${OUTPUT_VERSION}`);
