/**
 * Bundle mode — outputs dist/main.js for dev and Docker
 */
import { join } from 'node:path';
import pc from 'picocolors';
import { folderTarPlugin } from '@/plugins';
import { done, elapsed, fileSize, log, step } from './log';

export async function bundle(): Promise<void> {
  const distDir = join(import.meta.dir, '../dist');

  log(pc.bold('BRIKA Build'));
  console.log();
  step('Bundling...');

  const result = await Bun.build({
    entrypoints: [
      join(import.meta.dir, '../src/main.ts'),
    ],
    outdir: distDir,
    target: 'bun',
    minify: true,
    sourcemap: 'linked',
    plugins: [
      folderTarPlugin(),
    ],
  });

  if (!result.success) {
    for (const l of result.logs) console.error(`  ${l.message}`);
    process.exit(1);
  }

  const outPath = result.outputs[0]?.path ?? '';
  log(pc.dim(`  ${outPath}  ${await fileSize(outPath)}`));
  console.log();
  done(`Built in ${pc.bold(elapsed())}`);
}
