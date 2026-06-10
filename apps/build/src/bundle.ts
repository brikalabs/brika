/**
 * Bundle mode — produces `apps/build/dist/<target>/server.[hash].js` for
 * environments that already have Bun installed (Docker, CI workers).
 *
 * No `--compile` step; the output is a plain JS file you run with
 * `bun dist/<target>/server.<hash>.js`. The same build-time plugins
 * apply, so `.mock.ts` files are stripped here too.
 */

import { join } from 'node:path';
import pc from 'picocolors';
import { done, elapsed, fileSize, log, step } from './log';
import { bundlePreludeSource, embedPrelude } from './plugins/embed-prelude';
import { stubMockFiles } from './plugins/stub-mock-files';
import { stubReactDevtoolsCore } from './plugins/stub-react-devtools-core';
import { type BuildTarget, resolveEntrypoint } from './targets';

const DIST_ROOT = join(import.meta.dir, '../dist');

export async function bundle(target: BuildTarget): Promise<void> {
  const outDir = join(DIST_ROOT, target.outputSubdir ?? target.name);

  log(pc.bold(`BRIKA Bundle — ${target.name}`));
  console.log();
  step('Bundling...');

  const preludeSource = await bundlePreludeSource();
  const result = await Bun.build({
    entrypoints: [resolveEntrypoint(target)],
    outdir: outDir,
    naming: 'server.[hash].[ext]',
    target: 'bun',
    minify: true,
    plugins: [stubReactDevtoolsCore(), stubMockFiles(), embedPrelude(preludeSource)],
  });

  if (!result.success) {
    for (const l of result.logs) { console.error(`  ${l.message}`); }
    process.exit(1);
  }

  const outPath = result.outputs[0]?.path ?? '';
  log(pc.dim(`  ${outPath}  ${await fileSize(outPath)}`));
  console.log();
  done(`Bundled ${pc.bold(target.name)} in ${pc.bold(elapsed())}`);
}
