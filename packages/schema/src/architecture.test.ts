/**
 * Architecture guards for the contract package. Two invariants keep the rest
 * of the workspace sound, and nothing but this test enforces them:
 *
 *   1. LEAF-NESS — this package imports nothing from the workspace (zod and
 *      relative imports only). The sdk⇄compiler cycle was broken by moving
 *      shared contracts HERE; a stray `@brika/*` import would rebuild it.
 *   2. EDGE-SAFETY — the modules the compiler pulls into its V8/Worker bundles
 *      must be zod-free at runtime: every import in them must be `import type`
 *      (erased at compile time), or the isolate bundle silently grows a zod
 *      dependency that breaks in a Worker.
 */

import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SRC = join(import.meta.dir);

/** Modules bundled into the compiler's V8 routes: no runtime imports allowed. */
const EDGE_SAFE = ['collect-sink.ts', 'i18n-keys.ts', 'browser-bridge.ts', 'fs-runtime.ts'];

const IMPORT_STATEMENT = /^import\s[^;]*?from\s+['"]([^'"]+)['"]/gm;

async function sourceFiles(): Promise<string[]> {
  const entries = await readdir(SRC);
  return entries.filter((f) => f.endsWith('.ts') && !f.includes('.test.'));
}

describe('@brika/schema architecture', () => {
  test('imports nothing from the workspace (leaf package)', async () => {
    for (const file of await sourceFiles()) {
      const code = await readFile(join(SRC, file), 'utf8');
      for (const match of code.matchAll(IMPORT_STATEMENT)) {
        const specifier = match[1] ?? '';
        const allowed =
          specifier === 'zod' || specifier.startsWith('.') || specifier.startsWith('node:');
        expect(`${file}: ${specifier} allowed=${allowed}`).toBe(
          `${file}: ${specifier} allowed=true`
        );
      }
    }
  });

  test('edge-safe modules only use type-only imports (zod-free at runtime)', async () => {
    for (const file of EDGE_SAFE) {
      const code = await readFile(join(SRC, file), 'utf8');
      for (const match of code.matchAll(IMPORT_STATEMENT)) {
        const statement = match[0];
        const typeOnly = statement.startsWith('import type ');
        expect(`${file}: ${statement.split('\n')[0]} typeOnly=${typeOnly}`).toBe(
          `${file}: ${statement.split('\n')[0]} typeOnly=true`
        );
      }
    }
  });

  test('the package depends on zod and nothing else', async () => {
    const pkg: unknown = JSON.parse(await readFile(join(SRC, '..', 'package.json'), 'utf8'));
    const deps =
      pkg !== null && typeof pkg === 'object' && 'dependencies' in pkg ? pkg.dependencies : {};
    expect(Object.keys(deps ?? {})).toEqual(['zod']);
  });
});
