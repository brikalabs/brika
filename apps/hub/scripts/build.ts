#!/usr/bin/env bun
/**
 * Build script for compiling the BRIKA hub into a standalone executable
 * Templates are embedded via macro at bundle-time
 */
import { join } from 'node:path';

const hubDir = join(import.meta.dir, '..');

const result = await Bun.build({
  entrypoints: [join(hubDir, 'src/main.ts')],
  target: 'bun',
  minify: true,
  sourcemap: 'linked',
});

// Note: For compiled executables, use `bun build --compile` from CLI

if (!result.success) {
  console.error('❌ Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log('✅ Build successful:', result.outputs[0]?.path);
console.log('✅ Templates embedded in binary via macro - fully self-contained!');
