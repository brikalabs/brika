/**
 * Compile mode — outputs a standalone binary with embedded Bun runtime
 */
import { join } from 'node:path';
import pc from 'picocolors';
import { done, elapsed, fail, fileSize, log, step } from './log';

const TARGETS = [
  'bun-linux-x64',
  'bun-linux-arm64',
  'bun-darwin-x64',
  'bun-darwin-arm64',
  'bun-windows-x64',
] as const;

export async function compile(target?: string): Promise<void> {
  const validTarget = target ? TARGETS.find((t) => t === target) : undefined;
  if (target && !validTarget) {
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
    entrypoints: [join(import.meta.dir, '../src/main.ts')],
    target: 'bun',
    minify: true,
    // Stub `react-devtools-core` — ink imports it at the top of
    // `devtools.js`, but the real package is an optional peer that only
    // matters when the TUI is launched with React DevTools enabled. The
    // compiled binary never opts in, so we resolve the import to a
    // harmless empty module instead of pulling in the 600 KB devtools
    // bridge (which `external` can't satisfy at runtime — there is no
    // node_modules inside the compiled binary).
    plugins: [
      {
        name: 'stub-react-devtools-core',
        setup(build) {
          build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
            path: 'react-devtools-core',
            namespace: 'stub',
          }));
          build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'export default {}; export const connectToDevTools = () => {};',
            loader: 'js',
          }));
        },
      },
    ],
    compile: {
      outfile: outPath,
      ...(validTarget
        ? {
            target: validTarget,
          }
        : {}),
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
