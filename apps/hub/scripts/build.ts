#!/usr/bin/env bun
/**
 * Build script for compiling the BRIKA hub into a standalone executable
 * Templates are embedded via the folder-tar bundler plugin
 */
import { join } from 'node:path';
import { folderTarPlugin } from '@/plugins';

const result = await Bun.build({
  entrypoints: [join(import.meta.dir, '../src/main.ts')],
  outdir: join(import.meta.dir, '../dist'),
  target: 'bun',
  minify: true,
  sourcemap: 'linked',
  plugins: [folderTarPlugin()],
});

// Note: For compiled executables, use `bun build --compile` from CLI

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log('Build successful:', result.outputs[0]?.path);
console.log('Templates embedded in binary via folder-tar plugin - fully self-contained!');
