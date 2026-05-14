#!/usr/bin/env bun
/// <reference path="./react-refresh.d.ts" />
/**
 * `tui` — one-command hot-reload launcher for Ink TUIs.
 *
 *   tui src/main.ts
 *
 * State-preserving Fast Refresh for `.tsx`/`.jsx` saves. Non-
 * component file edits (`.ts`/`.js`) require a manual restart.
 */

import { resolve } from 'node:path';

const entry = process.argv[2];
if (!entry) {
  process.stderr.write('usage: tui <entry> [...args]\n');
  process.exit(1);
}

const entryPath = resolve(process.cwd(), entry);
// Reshape argv so the entry sees ITS args, not the launcher's.
process.argv = [process.argv[0] ?? 'bun', entryPath, ...process.argv.slice(3)];

// Side-effect import: preload.ts registers the Bun plugin and starts
// the watcher. Must run before the entry's `.tsx` imports.
await import('./preload');
await import(entryPath);
