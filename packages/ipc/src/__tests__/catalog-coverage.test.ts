/**
 * Catalog coverage — every error code thrown from first-party code (apps/ +
 * packages/) must be present in `ErrorCatalog`.
 *
 * The `BrikaErrorCode` type intentionally widens to `string` so third-party
 * plugins can mint their own codes; but inside this monorepo we want every
 * literal to be catalogued so docs, severity, httpStatus, and i18n keys stay
 * in sync. This test enforces that contract by scanning source files for
 * `new BrikaError('LITERAL', …)`, `new RpcError('LITERAL', …)`, and
 * `new CapabilityError('LITERAL', …)` and checking each literal against
 * `ErrorCatalog`.
 */

import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ErrorCatalog } from '../error-catalog';

const REPO_ROOT = resolve(__dirname, '../../../..');

const SEARCH_ROOTS = ['apps', 'packages'];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '__tests__',
  '__benchmarks__',
  '__fixtures__',
  '.turbo',
  '.next',
  'build',
  'coverage',
]);

/**
 * Patterns that throw / construct a typed error in first-party code. The
 * first capturing group must be the code literal.
 */
const PATTERNS = [
  /new\s+BrikaError\s*\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
  /new\s+RpcError\s*\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
  /new\s+CapabilityError\s*\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
];

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(full);
    }
  }
  return files;
}

describe('error catalog coverage', () => {
  test('every BrikaError/RpcError/CapabilityError literal is catalogued', async () => {
    const catalogued = new Set(Object.keys(ErrorCatalog));
    const uncatalogued: { code: string; file: string; line: number }[] = [];

    for (const root of SEARCH_ROOTS) {
      const files = await walk(join(REPO_ROOT, root));
      for (const file of files) {
        const text = await readFile(file, 'utf-8');
        for (const pattern of PATTERNS) {
          pattern.lastIndex = 0;
          let m: RegExpExecArray | null = pattern.exec(text);
          while (m !== null) {
            const code = m[1];
            if (code !== undefined && !catalogued.has(code)) {
              const line = text.slice(0, m.index).split('\n').length;
              uncatalogued.push({ code, file: file.replace(`${REPO_ROOT}/`, ''), line });
            }
            m = pattern.exec(text);
          }
        }
      }
    }

    if (uncatalogued.length > 0) {
      const report = uncatalogued
        .map(({ code, file, line }) => `  ${code} at ${file}:${line}`)
        .join('\n');
      throw new Error(
        `Found ${uncatalogued.length} uncatalogued error code(s). ` +
          `Add an entry to ErrorCatalog in packages/ipc/src/error-catalog.ts:\n${report}`
      );
    }
    expect(uncatalogued).toHaveLength(0);
  });

  test('every catalog entry has the required fields', () => {
    for (const [code, entry] of Object.entries(ErrorCatalog)) {
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
      expect(typeof entry.httpStatus).toBe('number');
      expect(['info', 'warning', 'error', 'fatal']).toContain(entry.severity);
      expect(['core', 'network', 'fs', 'exec', 'secrets', 'workflow', 'manifest']).toContain(
        entry.category
      );
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });
});
