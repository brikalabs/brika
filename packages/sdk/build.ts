import { chmod } from 'node:fs/promises';

const external = ['zod', 'lucide-react'];

function assertBuild(result: Awaited<ReturnType<typeof Bun.build>>): void {
  if (!result.success) {
    for (const log of result.logs) console.error(log.message);
    process.exit(1);
  }
}

const result = await Bun.build({
  entrypoints: [
    './src/index.ts',
    './src/actions.ts',
    './src/brick-views.ts',
    './src/sparks.ts',
    './src/lifecycle.ts',
    './src/storage.ts',
    './src/testing.ts',
    './src/ui-kit/index.ts',
    './src/ui-kit/icons.ts',
    './src/ui-kit/hooks.ts',
  ],
  outdir: './dist',
  root: './src',
  target: 'bun',
  splitting: true,
  minify: true,
  external,
});
assertBuild(result);

// Build verify binary separately with shebang
const verifyResult = await Bun.build({
  entrypoints: ['./src/verify.ts'],
  outdir: './dist',
  root: './src',
  target: 'bun',
  minify: true,
  external,
  banner: '#!/usr/bin/env bun',
});
assertBuild(verifyResult);
await chmod('./dist/verify.js', 0o755);

// Generate .d.ts declarations
const tsc = Bun.spawn(['bunx', '--bun', 'tsc', '-p', 'tsconfig.build.json'], {
  cwd: import.meta.dir,
  stdio: ['ignore', 'inherit', 'inherit'],
});
if ((await tsc.exited) !== 0) process.exit(1);
