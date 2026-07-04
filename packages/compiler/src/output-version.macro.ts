/**
 * Build-time fingerprint of the compiler's output. Runs as a Bun macro
 * (`with { type: 'macro' }`), so its return value is inlined as a constant, like
 * the repo's `build-info.macro`. It hashes everything that can change compiled
 * output for unchanged plugin sources:
 *   - the compiler's own source (`src/**\/*.ts`, minus tests) - both the Bun
 *     path and the isolate `bundle/` adapters
 *   - the Bun version (its `Bun.build` / `Bun.Transpiler` produce the bytes)
 *   - the compiler's declared dependency ranges (rollup/sucrase for the isolate,
 *     etc.) read from this package's own package.json
 *
 * So it bumps automatically on any compiler or toolchain change, replacing the
 * hand-bumped `COMPILER_OUTPUT_VERSION = '3'` that a human had to remember.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function outputVersion(): string {
  const srcDir = fileURLToPath(new URL('.', import.meta.url));
  const hash = createHash('sha256');
  for (const rel of readdirSync(srcDir, { recursive: true }).map(String).sort()) {
    if (!rel.endsWith('.ts') || rel.endsWith('.test.ts')) {
      continue;
    }
    // Normalize the OS path separator so the fingerprint is identical on
    // Windows and POSIX for the same source.
    hash.update(rel.replaceAll('\\', '/'));
    hash.update(readFileSync(join(srcDir, rel)));
  }
  hash.update(`bun@${Bun.version}`);
  // Dep ranges from this package's own (trusted) package.json - always readable,
  // unlike `import.meta.resolve('<dep>/package.json')`, which throws when a dep's
  // exports map omits `./package.json` (e.g. @rollup/browser under Node). No zod
  // import here, so `dist/bun` can mark zod external without breaking the macro.
  const raw: unknown = JSON.parse(readFileSync(join(srcDir, '..', 'package.json'), 'utf8'));
  const deps =
    raw !== null && typeof raw === 'object' && 'dependencies' in raw ? raw.dependencies : {};
  hash.update(JSON.stringify(deps));
  return hash.digest('hex').slice(0, 12);
}
