/**
 * Compile mode — outputs a standalone binary with embedded Bun runtime
 */
import { join } from 'node:path';
import pc from 'picocolors';
import { folderTarPlugin } from '@/plugins';
import { done, elapsed, fail, fileSize, log, step } from './log';

const TARGETS = [
  'bun-linux-x64',
  'bun-linux-arm64',
  'bun-darwin-x64',
  'bun-darwin-arm64',
  'bun-windows-x64',
] as const;

type Target = (typeof TARGETS)[number];

export async function compile(target?: string): Promise<void> {
  if (target && !TARGETS.includes(target as Target)) {
    fail(`Invalid target: ${target}`);
    log(`Valid: ${TARGETS.join(', ')}`);
    process.exit(1);
  }

  const distDir = join(import.meta.dir, '../dist');
  const isWindows = target?.includes('windows') ?? process.platform === 'win32';
  const outPath = join(distDir, isWindows ? 'brika.exe' : 'brika');
  const displayTarget = target ?? `${process.platform}-${process.arch}`;

  log(pc.bold('BRIKA Compile'));
  log(pc.dim(`target: ${displayTarget}  output: ${outPath}`));
  console.log();

  step('Bundling & compiling...');

  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, '../src/cli.ts')],
    target: 'bun',
    minify: true,
    plugins: [folderTarPlugin()],
    compile: {
      outfile: outPath,
      ...(target ? { target: target as Bun.Target } : {}),
    },
  });

  if (!result.success) {
    for (const l of result.logs) console.error(`  ${l.message}`);
    process.exit(1);
  }

  log(pc.dim(`  ${await fileSize(outPath)}`));

  // Step 3: Compute SHA256 of compiled binary
  step('Computing SHA256...');
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(await Bun.file(outPath).arrayBuffer());
  const sha256 = hasher.digest('hex');
  log(pc.dim(`  ${sha256}`));

  console.log();
  done(`Compiled in ${pc.bold(elapsed())}`);
}
