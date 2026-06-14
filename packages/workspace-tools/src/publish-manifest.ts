/**
 * Pure package.json transforms applied at publish time, shared by the release
 * CLI (scripts/release-libs.ts) and the registry test harness (./test-registry).
 *
 * Each takes the manifest text and returns the rewritten JSON (normalized), or
 * null when nothing changed. The publisher applies them on disk just before
 * `npm publish`, then restores the original; the harness applies them to pack a
 * package exactly as it will ship.
 */

import { z } from 'zod';

const exportsManifestSchema = z
  .object({ exports: z.record(z.string(), z.unknown()).optional() })
  .loose();

/**
 * Drop every `./internal/*` exports subpath from the published manifest. These
 * are workspace-only entries (they resolve the private build toolchain, e.g.
 * `@brika/sdk/internal/cli`), so importing one from npm would fail to resolve a
 * private package. The source files stay in the tarball as harmless dead code;
 * only the resolvable public surface is trimmed. Returns the rewritten JSON
 * (normalized, restored after publish), or null when there are no such entries.
 */
export function stripInternalExports(text: string): string | null {
  const parsed = exportsManifestSchema.safeParse(JSON.parse(text));
  if (!parsed.success || parsed.data.exports === undefined) {
    return null;
  }
  const map = parsed.data.exports;
  const internal = Object.keys(map).filter((key) => key.startsWith('./internal/'));
  if (internal.length === 0) {
    return null;
  }
  for (const key of internal) {
    delete map[key];
  }
  return `${JSON.stringify(parsed.data, null, 2)}\n`;
}

const recordSchema = z.record(z.string(), z.unknown());

/**
 * Drop dev-only tooling keys (currently `knip`, the per-package dead-code config
 * read by the workspace knip generator) from the published manifest. They mean
 * nothing to a consumer, so a published package should not carry them. Returns
 * the rewritten JSON (normalized, restored after publish), or null when absent.
 */
export function stripDevManifestFields(text: string): string | null {
  const data = recordSchema.parse(JSON.parse(text));
  if (data.knip === undefined) {
    return null;
  }
  delete data.knip;
  return `${JSON.stringify(data, null, 2)}\n`;
}

const bundleManifestSchema = z
  .object({
    scripts: z.record(z.string(), z.string()).default({}),
    exports: z.record(z.string(), z.unknown()).default({}),
  })
  .loose();

/** A package opts into bundle-publish by having a `build:dist` script (tsdown). */
export function isBundlePublished(text: string): boolean {
  const parsed = bundleManifestSchema.safeParse(JSON.parse(text));
  return parsed.success && parsed.data.scripts['build:dist'] !== undefined;
}

/**
 * Repoint every source-backed public export at the built `dist/pkg` bundle (JS +
 * types). The workspace keeps committed `exports` -> `src` for zero-build dev;
 * this runs ONLY at publish, after `build:dist`, so npm consumers get the
 * self-contained bundle (private closure inlined) instead of raw `.ts`. Entry
 * names mirror tsdown's derivation (`.` -> index, `./x` -> x). Returns the
 * rewritten JSON, or null when nothing is source-backed.
 */
export function bundleExports(text: string): string | null {
  const parsed = bundleManifestSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    return null;
  }
  const map = parsed.data.exports;
  let changed = false;
  for (const [key, target] of Object.entries(map)) {
    if (typeof target !== 'string' || !target.startsWith('./src/') || !target.endsWith('.ts')) {
      continue;
    }
    const name = key === '.' ? 'index' : key.slice(2);
    map[key] = { types: `./dist/pkg/${name}.d.ts`, default: `./dist/pkg/${name}.js` };
    changed = true;
  }
  return changed ? `${JSON.stringify(parsed.data, null, 2)}\n` : null;
}
