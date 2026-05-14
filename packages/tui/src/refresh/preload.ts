/**
 * Preload entry for `tui`. Owns the whole reload loop: load
 * React/Ink once via the Bun plugin, watch the workspace, on `.tsx`
 * save transform → tempfile → dynamic import → refresh.
 *
 * Why not `bun --hot`? It re-evaluates React on every reload, giving
 * the new component module a SEPARATE React instance from the one
 * Ink is rendering. Hooks then explode with "resolveDispatcher() is
 * null". Driving the loop ourselves keeps a single React/Ink alive.
 *
 * `DEV=true` is required for Ink's `injectIntoDevTools()` — that's
 * the call that wires React's reconciler into our Fast Refresh hook.
 */

/// <reference path="./react-refresh.d.ts" />
process.env.DEV = 'true';

import { plugin } from 'bun';
import { transform as swcTransform } from '@swc/core';
import { mkdirSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { clearHmrError, installCrashGuard, setHmrError } from './error-store';
import { HmrErrorBoundary } from './HmrErrorBoundary';
import { HmrErrorOverlay } from './HmrErrorOverlay';
import { createRefreshPlugin } from './plugin';
// Side-effect: installs the Fast Refresh hook on globalThis.
import { performReactRefresh } from './runtime';
import { wrapWithRefresh } from './wrap';

// Capture async crashes (React schedules render work in microtasks
// that fire AFTER our refresh call returns; without a global guard,
// a bad component throws an unhandled rejection and Bun kills the
// process). Install BEFORE any user code can trigger a render.
installCrashGuard();

// Silence Ink's "react-devtools-core not installed" warning. We need
// Ink's `injectIntoDevTools()` path (DEV=true) but not its attempted
// connection to a real DevTools UI.
{
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes('react-devtools-core')) {
      return;
    }
    origWarn.apply(console, args);
  };
}

declare global {
  // Exposed to `@brika/cli`'s `runTui` so it can auto-wrap the user's
  // tree with the boundary + sibling overlay — keeps consumer
  // App.tsx files free of dev-only wiring.
  // biome-ignore lint/style/noVar: required for global augmentation
  var __brikaHmrOverlay: typeof HmrErrorOverlay | undefined;
  // biome-ignore lint/style/noVar: required for global augmentation
  var __brikaHmrBoundary: typeof HmrErrorBoundary | undefined;
}

globalThis.__brikaHmrOverlay = HmrErrorOverlay;
globalThis.__brikaHmrBoundary = HmrErrorBoundary;

const runtimeImport = new URL('./runtime.ts', import.meta.url).href;
const rootDir = process.cwd();
// Watcher climbs to the workspace root so `dev:hot` from `apps/cli/`
// also picks up edits in `packages/brix/`, `packages/tui/`, etc.
const watchRoot = findWorkspaceRoot(rootDir);

plugin(createRefreshPlugin({ rootDir, runtimeImport }));

// Tempfiles live under the entry package's `node_modules` so bare
// imports (`react`, `ink`, …) resolve through the same boundary the
// entry uses. Wipe stale tempfiles from prior sessions.
const tempDir = join(rootDir, 'node_modules', '.cache', 'brika-hmr');
rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

{
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let counter = 0;
  const pending = new Set<string>();
  watch(watchRoot, { recursive: true }, (_event, filename) => {
    if (
      !filename ||
      filename.includes('node_modules/') ||
      !(filename.endsWith('.tsx') || filename.endsWith('.jsx'))
    ) {
      return;
    }
    pending.add(resolve(watchRoot, filename));
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(() => {
      const batch = Array.from(pending);
      pending.clear();
      counter += 1;
      void flushBatch(batch, counter);
    }, 80);
  });
}

async function flushBatch(paths: readonly string[], tick: number): Promise<void> {
  let firstError: { path: string; err: unknown } | null = null;
  for (const path of paths) {
    try {
      await reloadOne(path, tick);
    } catch (err) {
      if (!firstError) {
        firstError = { path, err };
      }
    }
  }
  if (firstError) {
    reportError(firstError.path, firstError.err);
    return;
  }
  // `performReactRefresh()` can throw if the new component code makes
  // the live tree fail to render (e.g. Ink rejects a bare string,
  // a hook order changes, …). Without this guard the throw escapes
  // the watcher's microtask and kills the process — route it to the
  // overlay instead so the user can fix and save again.
  try {
    performReactRefresh();
    clearHmrError();
  } catch (err) {
    reportError(paths[0] ?? '<unknown>', err);
  }
}

function reportError(path: string, err: unknown): void {
  setHmrError({
    file: relative(rootDir, path) || path,
    message: describe(err),
    stack: err instanceof Error ? err.stack : undefined,
    at: Date.now(),
  });
}

async function reloadOne(filePath: string, tick: number): Promise<void> {
  const source = await readFile(filePath, 'utf8');
  const moduleId = relative(rootDir, filePath) || filePath;

  // SWC does TS strip + JSX → `_jsx` + `$RefreshReg$` instrumentation
  // in a single native pass. `react/jsx-runtime` resolves to the SAME
  // singleton already in the module cache, so the tempfile imports
  // share React with the live tree.
  const transformed = await swcTransform(source, {
    filename: filePath,
    sourceMaps: 'inline',
    jsc: {
      parser: { syntax: 'typescript', tsx: true },
      target: 'es2022',
      transform: {
        react: {
          runtime: 'automatic',
          development: true,
          refresh: true,
        },
      },
    },
  });

  if (!transformed.code) {
    return;
  }

  // Relative imports in the source (`./foo`, `../bar`) would resolve
  // against the tempfile's location (`node_modules/.cache/brika-hmr/`)
  // and miss. Rewrite to absolute paths anchored at the ORIGINAL
  // source dir before wrapping. Bare specifiers (`react`, `ink`, …)
  // are unaffected.
  const rewritten = rewriteRelativeImports(transformed.code, dirname(filePath));
  const wrapped = wrapWithRefresh(rewritten, moduleId, runtimeImport);
  const tempPath = join(tempDir, `m-${tick}-${safeName(moduleId)}.mjs`);
  writeFileSync(tempPath, wrapped);
  await import(tempPath);
}

function safeName(moduleId: string): string {
  return moduleId.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Rewrite ESM relative imports (`./x`, `../y/z`) to absolute paths
 * anchored at `sourceDir`. Tempfiles live elsewhere on disk, so
 * relative resolution from there would miss the source's siblings.
 * Bare specifiers are left alone (the regex only matches `./` /
 * `../`).
 */
function rewriteRelativeImports(code: string, sourceDir: string): string {
  return code.replace(
    /(\bfrom\s+['"]|\bimport\s*\(\s*['"]|\bimport\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
    (_, prefix: string, spec: string, suffix: string) => `${prefix}${resolve(sourceDir, spec)}${suffix}`
  );
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Climb from `start` to the nearest ancestor `package.json` with a
 * `workspaces` field — the bun/npm/yarn monorepo root. Falls back
 * to `start` if none is found in 12 levels (sanity cap).
 */
function findWorkspaceRoot(start: string): string {
  let dir = resolve(start);
  for (let i = 0; i < 12; i += 1) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'workspaces' in parsed &&
        parsed.workspaces !== undefined
      ) {
        return dir;
      }
    } catch {
      // Missing or malformed package.json — keep climbing.
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return start;
    }
    dir = parent;
  }
  return start;
}
