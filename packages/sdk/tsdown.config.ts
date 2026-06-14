import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';
import { z } from 'zod';

/**
 * Publish bundle for the PUBLIC @brika/sdk.
 *
 * Entries are derived from the package's own `exports`, the single source of
 * truth: adding or removing a public subpath needs no change here. A subpath
 * becomes a bundle entry when its target is TypeScript under `src/`. Two kinds
 * of export are intentionally skipped:
 *   - asset exports such as `./tsconfig.plugin.json` (not a `.ts` module);
 *   - `./internal/*` subpaths (e.g. the author CLI, which pulls in the private
 *     compiler). They are workspace-only and the publisher strips them as well
 *     (release-libs `stripInternalExports`), so the bundle mirrors that strip.
 *
 * Runtime deps (zod) and peers (react, lucide-react, @brika/testing) are
 * auto-externalized by tsdown; the PRIVATE closure lives in devDependencies, so
 * tsdown bundles it inline. The dts tsconfig sits one level up (packages/) so
 * tsgo's rootDir spans the closure source it must inline.
 */
const { exports: exportMap } = z
  .object({ exports: z.record(z.string(), z.string()) })
  .parse(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')));

/**
 * Bundle every export whose target is source under `src/`. `src/` holds exactly
 * the shippable runtime, so this is the whole rule: the `./tsconfig.plugin.json`
 * asset and the `./internal/cli` author tooling (which lives in `cli/`, outside
 * `src/`) fall away on their own. tsdown names each output after the export key:
 * `.` -> index, `./x` -> x.
 */
const entry = Object.fromEntries(
  Object.entries(exportMap)
    .filter(([, target]) => target.startsWith('./src/'))
    .map(([subpath, target]) => [subpath === '.' ? 'index' : subpath.slice(2), target.slice(2)])
);

export default defineConfig({
  entry,
  format: 'esm',
  minify: true,
  sourcemap: false,
  outDir: 'dist/pkg',
  outExtensions: () => ({ js: '.js' }),
  dts: { tsgo: true, tsconfig: '../tsconfig.sdk-dts.json' },
});
