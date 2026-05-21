/**
 * Compile mode — outputs a standalone binary with embedded Bun runtime
 */
import { rm } from 'node:fs/promises';
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

  // Step 1: Bundle (applies folder-tar plugin for embedded templates)
  step('Bundling...');

  const bundle = await Bun.build({
    entrypoints: [join(import.meta.dir, '../src/cli.ts')],
    outdir: distDir,
    target: 'bun',
    minify: true,
    plugins: [folderTarPlugin()],
  });

  if (!bundle.success) {
    for (const l of bundle.logs) console.error(`  ${l.message}`);
    process.exit(1);
  }

  const bundlePath = bundle.outputs[0]?.path;
  if (!bundlePath) {
    fail('No bundle output');
    process.exit(1);
  }
  log(pc.dim(`  ${await fileSize(bundlePath)}`));

  // Step 2: Compile bundle into standalone binary
  step('Compiling...');

  const compileArgs = ['bun', 'build', '--compile', bundlePath, '--outfile', outPath];
  if (target) compileArgs.push(`--target=${target}`);

  const proc = Bun.spawn(compileArgs, { stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    fail(`Compile failed (exit ${exitCode})`);
    if (stderr.trim()) log(stderr.trim());
    process.exit(1);
  }

  // Cleanup intermediate bundle
  await rm(bundlePath, { force: true }).catch(() => {});
  await rm(`${bundlePath}.map`, { force: true }).catch(() => {});

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
