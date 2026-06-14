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

/** A public subpath is bundled when it points at TypeScript source under src/. */
const isBundledSource = (subpath: string, target: string): boolean =>
  target.startsWith('./src/') && target.endsWith('.ts') && !subpath.startsWith('./internal/');

/** tsdown names each output after its entry key: `.` -> index, `./x` -> x. */
const entryName = (subpath: string): string =>
  subpath === '.' ? 'index' : subpath.slice('./'.length);

const entry = Object.fromEntries(
  Object.entries(exportMap)
    .filter(([subpath, target]) => isBundledSource(subpath, target))
    .map(([subpath, target]) => [entryName(subpath), target.slice('./'.length)])
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
