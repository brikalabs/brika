/**
 * Compile mode — produces a standalone Bun-compiled binary for the
 * given {@link BuildTarget}.
 *
 * Each target has its own output sub-directory under `apps/build/dist/`
 * so multi-target runs don't clobber each other:
 *
 *   apps/build/dist/full/brika
 *   apps/build/dist/headless/brika-hub
 */

import { join } from 'node:path';
import pc from 'picocolors';
import { done, elapsed, fail, fileSize, log, step } from './log';
import { bundlePreludeSource, embedPrelude } from './plugins/embed-prelude';
import { stubMockFiles } from './plugins/stub-mock-files';
import { stubReactDevtoolsCore } from './plugins/stub-react-devtools-core';
import {
  type BuildTarget,
  isPlatform,
  type Platform,
  resolveEntrypoint,
} from './targets';

export interface CompileOptions {
  target: BuildTarget;
  /** Optional cross-compile platform; defaults to host. */
  platform?: string;
}

const DIST_ROOT = join(import.meta.dir, '../dist');

export async function compile({ target, platform }: CompileOptions): Promise<void> {
  let validPlatform: Platform | undefined;
  if (platform) {
    if (!isPlatform(platform)) {
      fail(`Invalid platform: ${platform}`);
      log(`Valid: ${(await import('./targets')).PLATFORMS.join(', ')}`);
      process.exit(1);
    }
    validPlatform = platform;
  }

  const isWindows = platform?.includes('windows') ?? process.platform === 'win32';
  const outDir = join(DIST_ROOT, target.outputSubdir ?? target.name);
  const outPath = join(outDir, isWindows ? `${target.binaryName}.exe` : target.binaryName);
  const displayPlatform = platform ?? `${process.platform}-${process.arch}`;

  log(pc.bold(`BRIKA Compile — ${target.name}`));
  log(pc.dim(`platform: ${displayPlatform}  output: ${outPath}`));
  console.log();

  step('Bundling & compiling...');

  const preludeSource = await bundlePreludeSource();
  const result = await Bun.build({
    entrypoints: [resolveEntrypoint(target)],
    target: 'bun',
    minify: true,
    plugins: [stubReactDevtoolsCore(), stubMockFiles(), embedPrelude(preludeSource)],
    compile: {
      outfile: outPath,
      ...(validPlatform
        ? {
            target: validPlatform,
          }
        : {}),
    },
  });

  if (!result.success) {
    for (const l of result.logs) { console.error(`  ${l.message}`); }
    process.exit(1);
  }

  log(pc.dim(`  ${await fileSize(outPath)}`));

  step('Computing SHA256...');
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(await Bun.file(outPath).arrayBuffer());
  const sha256 = hasher.digest('hex');
  log(pc.dim(`  ${sha256}`));

  console.log();
  done(`Compiled ${pc.bold(target.name)} in ${pc.bold(elapsed())}`);
}
