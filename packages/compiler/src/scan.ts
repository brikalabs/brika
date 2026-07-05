/**
 * Source-file discovery for `brika build`. Locates the plugin modules that the
 * manifest generator and entry generator operate on, following Brika's
 * `src/<kind>/...` layout conventions and skipping `_` helpers and test files.
 */

import { join, relative } from 'node:path';

/** Collect file paths matching a glob under the plugin root, skipping `_` helpers. */
async function scanGlob(pluginRoot: string, pattern: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const glob = new Bun.Glob(pattern);
    for await (const rel of glob.scan({ cwd: pluginRoot })) {
      const base = rel.split('/').pop() ?? rel;
      // Skip `_` helpers and test files; neither is a capability or entry import.
      if (!(base.startsWith('_') || base.includes('.test.') || base.includes('.spec.'))) {
        out.push(join(pluginRoot, rel));
      }
    }
  } catch {
    // Directory may not exist; treat as no matches.
  }
  return out;
}

/** Block logic lives in `src/blocks/*.ts`; `*.view.tsx` / `*.node.tsx` are views. */
export function blockFiles(pluginRoot: string): Promise<string[]> {
  return scanGlob(pluginRoot, 'src/blocks/*.ts');
}

/** Sparks may be a single `src/sparks.ts` or a `src/sparks/` directory. */
export async function sparkFiles(pluginRoot: string): Promise<string[]> {
  const [single, dir] = await Promise.all([
    scanGlob(pluginRoot, 'src/sparks.ts'),
    scanGlob(pluginRoot, 'src/sparks/*.ts'),
  ]);
  return Array.from(new Set([...single, ...dir]));
}

/** Brick descriptors are react-free modules at `src/bricks/<id>.brick.ts`. */
export function brickDescriptorFiles(pluginRoot: string): Promise<string[]> {
  return scanGlob(pluginRoot, 'src/bricks/*.brick.ts');
}

/** Legacy brick views with co-located meta/config exports at `src/bricks/<id>.tsx`. */
export function brickFiles(pluginRoot: string): Promise<string[]> {
  return scanGlob(pluginRoot, 'src/bricks/*.tsx');
}

/** Server-side action modules: `src/actions.ts` and/or `src/actions/*.ts`. */
export async function actionFiles(pluginRoot: string): Promise<string[]> {
  const [single, dir] = await Promise.all([
    scanGlob(pluginRoot, 'src/actions.ts'),
    scanGlob(pluginRoot, 'src/actions/*.ts'),
  ]);
  return Array.from(new Set([...single, ...dir]));
}

/** Server-side tool modules: `src/tools.ts` and/or `src/tools/*.ts`. */
export async function toolFiles(pluginRoot: string): Promise<string[]> {
  const [single, dir] = await Promise.all([
    scanGlob(pluginRoot, 'src/tools.ts'),
    scanGlob(pluginRoot, 'src/tools/*.ts'),
  ]);
  return Array.from(new Set([...single, ...dir]));
}

/** Pages are browser modules at `src/pages/<id>.tsx`. */
export function pageFiles(pluginRoot: string): Promise<string[]> {
  return scanGlob(pluginRoot, 'src/pages/*.tsx');
}

/**
 * Every plugin source module under `src/` (all `.ts`/`.tsx`, recursive), the
 * universe the action scan reads. Unlike the per-kind globs above this
 * deliberately keeps `_` helpers: an action registers from wherever the server
 * graph imports it (a helper file included), so only test files - never
 * reachable from the entry - are skipped.
 */
export async function sourceFiles(pluginRoot: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const glob = new Bun.Glob('src/**/*.{ts,tsx}');
    for await (const rel of glob.scan({ cwd: pluginRoot })) {
      const base = rel.split('/').pop() ?? rel;
      if (!(base.includes('.test.') || base.includes('.spec.'))) {
        out.push(join(pluginRoot, rel));
      }
    }
  } catch {
    // src/ may not exist; treat as no matches.
  }
  return out;
}

/** Return the first of `candidates` (paths relative to root) that exists. */
export async function firstExisting(
  root: string,
  candidates: string[]
): Promise<string | undefined> {
  for (const candidate of candidates) {
    const path = join(root, candidate);
    if (await Bun.file(path).exists()) {
      return path;
    }
  }
  return undefined;
}

/** A bare, extensionless ESM specifier from `fromDir` to `file`. */
export function toSpecifier(fromDir: string, file: string): string {
  const rel = relative(fromDir, file)
    .replaceAll('\\', '/')
    .replace(/\.tsx?$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}
